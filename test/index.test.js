describe("Kaster Mongoose", function(){
    this.timeout(5000);

    var 
        mongoose = require("mongoose"),
        async = require("async"),
        should = require("should"),
        uuid = require("uuid"),
        kasterMongoose = require("../lib"),
        kaster = require("kaster"),
        INTEGRATION = false,
        schema = mongoose.Schema({
            _id: {type: String, "default": uuid.v4},
            body: String,
            user: {type: String, ref: "User"},
            created: Date
        }),
        otherSchema = mongoose.Schema({
            _id: {type: String, "default": uuid.v4},
            body: String,
            user: {type: String, ref: "User"},
            created: Date
        }),
        userSchema = mongoose.Schema({
            _id: {type: String, "default": uuid.v4},
            name: String
        });
    

    mongoose.connect(process.env.MONGO_TEST_URI || "mongodb://localhost/kaster-mongoose-test");

    schema.plugin(kasterMongoose, {
        clientHost: process.env.KAFKA_TEST_HOST || "localhost:2181",
        immediate: true,
        namespace: "MyApp.Test",
        name: "Message",
        topic: "kaster-test"
    });

    otherSchema.plugin(kasterMongoose, {
        clientHost: process.env.KAFKA_TEST_HOST || "localhost:2181",
        immediate: true,
        namespace: "MyApp.Test",
        name: "OtherMessage",
        topic: "kaster-test"
    });

    var MessageModel = mongoose.model("Message", schema);
    var OtherMessageModel = mongoose.model("OtherMessage", otherSchema);
    var UserModel = mongoose.model("User", userSchema);
    var consumer, delete_message_id;

    before(function(done){
        this.timeout(10000);
        consumer = kaster.createConsumer({
                clientHost: process.env.KAFKA_TEST_HOST || "localhost:2181",
                topics: [
                    {topic: "kaster-test", partition: 0, offset: 0}
                ],
                settings: {
                    groupId: 'kafka-node-group', //consumer group id, deafult `kafka-node-group`
                    // Auto commit config 
                    autoCommit: false,
                    autoCommitIntervalMs: 5000,
                    // The max wait time is the maximum amount of time in milliseconds to block waiting if insufficient data is available at the time the request is issued, default 100ms
                    fetchMaxWaitMs: 100,
                    // This is the minimum number of bytes of messages that must be available to give a response, default 1 byte
                    fetchMinBytes: 1,
                    // The maximum bytes to include in the message set for this partition. This helps bound the size of the response.
                    fetchMaxBytes: 1024 * 10, 
                    // If set true, consumer will fetch message from the given offset in the payloads 
                    fromOffset: true
                }
        });

        var producer = kaster.createProducer({
            namespace: "Kaster.Test",
            clientHost: process.env.KAFKA_TEST_HOST || "localhost:2181",
            immediate: true
        });

        var timer = setTimeout(function(){
            INTEGRATION =false;
            MessageModel.remove({}, done);
        }, 5000);

        producer.on("ready", function(){
            clearTimeout(timer);
            kaster.send({ //Send with Avro serialization
                topic: "kaster-test-check",
                name: "Message",
                parition: 0
            }, { test: "test"}, function(err, data){

                if(err) {
                    console.log("Kafka not running. Not running integration tests.");
                    INTEGRATION = false;
                } else {
                    console.log("Kafka running! Running integration tests.");
                    INTEGRATION = true;
                }

                async.parallel([
                    function(cb){ MessageModel.remove({}, cb); },
                    function(cb){ OtherMessageModel.remove({}, cb); }
                ], done);
            });
            
        });

    });

    it("should send a model to kafka on save", function(done){
        var m1 = new MessageModel({
            body: "Hello world!",
            created: Date.now()
        });

        var message_id = m1._id;

        var messageHandler = kaster.createMessageHandler(function(err, message, header){
            if(err) throw err;

            if(
                message && 
                message_id && 
                message._id == message_id && 
                header && header.meta && header.meta["avro.schema"] &&
                header.meta["avro.schema"].name == "Message"
            ) {
                return done();
            }
        });

        consumer.on("message", messageHandler);
        
        m1.save(function(err, saved){
            if(err) throw err;
            delete_message_id = message_id = saved._id;
            if(!INTEGRATION) return done();
        });
    });

    it("should send a delete model schema to kafka on remove", function(done){

        MessageModel.findOne({_id: delete_message_id}, function(err, message){
            should.not.exist(err);
            should.exist(message);

            message.remove(function(err){
                if(err) throw err;
                if(!INTEGRATION) return done();
            });
        });

        var messageHandler = kaster.createMessageHandler(function(err, message, header){
            if(err) throw new Error(err);

            if(
                message && delete_message_id && 
                message._id == delete_message_id &&
                message.schema == "Message" && 
                header && header.meta && header.meta["avro.schema"] &&
                header.meta["avro.schema"].name == "Delete"
            ) {
                return done();
            }
        });

        consumer.on("message", messageHandler);
    });

    it("should send populated sub documents as ids", function(done){
    
        var m1 = new MessageModel({
            body: "Hello world!",
            created: Date.now()
        });

        var user = new UserModel({
            name: "Mark"
        });

        m1.user = user;
        var message_id = m1._id;

        var messageHandler = kaster.createMessageHandler(function(err, message, header){
            if(err) throw err;

            if(
                message && 
                message_id && 
                message._id == message_id && 
                header && header.meta && header.meta["avro.schema"] &&
                header.meta["avro.schema"].name == "Message"
            ) { 
                should.not.exist(message.user._id);
                should.exist(message.user);
                return done();
            }
        });

        consumer.on("message", messageHandler);
        
        user.save(function(){
            m1.populate("user", function(err, result){
                m1 = result;

                m1.save(function(err, saved){
                    if(err) throw err;
                    message_id = saved._id;
                    if(!INTEGRATION) return done();
                });
            });
        });
    });

    it("should sync a collection", function(done){
        //create some docs
        var 
            m1 = new OtherMessageModel({
                body: "Message 1 Test"
            }), 
            m2 = new OtherMessageModel({
                body: "Message 2 Test"
            }), 
            m3 = new OtherMessageModel({
                body: "Message 3 Test"
            });

        async.parallel([
            function(cb){ m1.save(cb); },
            function(cb){ m2.save(cb); },
            function(cb){ m3.save(cb); }
        ], function(err, results){

            var _ids = [m1._id, m2._id, m3._id], count = _ids.length;


            var messageHandler = kaster.createMessageHandler(function(err, message, header){
                if(err) throw err;

                if(
                    message && 
                    header && header.meta && header.meta["avro.schema"] &&
                    header.meta["avro.schema"].name == "OtherMessage" &&
                    _ids.indexOf(message._id) >= 0
                ) {
                    return --count || done();
                }
            });

            consumer.on("message", messageHandler);


            OtherMessageModel.count(function(err, total){

                OtherMessageModel.kasterSync(function(err, count){
                    
                    if(err) console.log(err);
                    if(!INTEGRATION) return done();

                    should.exist(count);
                    count.should.equal(total);

                });
            });

        });
    });
});