describe("Kaster Mongoose", function(){
    this.timeout(10000);

    if(
        (!process.env.AWS_ACCESS_KEY && !process.env.AWS_ACCESS_KEY_ID) ||
        (!process.env.AWS_SECRET_KEY && !process.env.AWS_SECRET_ACCESS_KEY)
    ) {
        return;
    }

    var 
        STREAM_NAME = process.env.TEST_STREAM || "testing",
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
        namespace: "MyApp.Test",
        name: "Message",
        topic: STREAM_NAME
    });

    otherSchema.plugin(kasterMongoose, {
        namespace: "MyApp.Test",
        name: "OtherMessage",
        topic: STREAM_NAME
    });

    var MessageModel = mongoose.model("Message", schema);
    var OtherMessageModel = mongoose.model("OtherMessage", otherSchema);
    var UserModel = mongoose.model("User", userSchema);
    var consumer, delete_message_id;

    var consumer = kaster.createConsumer({
        topic: STREAM_NAME,
        region: "us-east-1",
        oldest: true,
        // shardIds: shard
    });
    
    // var kinesis = require("kinesis");

    // before(function(done){
    //     kinesis.request("CreateStream", {
    //         ShardCount: 1,
    //         StreamName: STREAM_NAME
    //     }, {
    //         region: "us-east-1"
    //     }, done);
    // });

    // after(function(done){
    //     kinesis.request("CreateStream", {
    //         StreamName: STREAM_NAME
    //     }, {
    //         region: "us-east-1"
    //     }, done);
    // });


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

        consumer.on("data", messageHandler);
        
        m1.save(function(err, saved){
            if(err) throw err;
            delete_message_id = message_id = saved._id;
        });
    });

    it("should send a delete model schema to kafka on remove", function(done){

        MessageModel.findOne({_id: delete_message_id}, function(err, message){
            should.not.exist(err);
            should.exist(message);

            message.remove(function(err){
                if(err) throw err;
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

        consumer.on("data", messageHandler);
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

        consumer.on("data", messageHandler);
        
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

            consumer.on("data", messageHandler);

            should.not.exist(err);

            if(!INTEGRATION) return done();

            OtherMessageModel.count(function(err, total){

                OtherMessageModel.kasterSync(function(err, count){
                    
                    if(err) console.log(err);
                    

                    should.exist(count);
                    count.should.equal(total);

                });
            });

        });
    });
});