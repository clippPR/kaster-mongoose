describe("Kaster Mongoose", function(){
    
    var 
        mongoose = require("mongoose"),
        uuid = require("uuid"),
        kasterMongoose = require("../lib"),
        kaster = require("kaster"),
        INTEGRATION = false,
        schema = mongoose.Schema({
            _id: {type: String, "default": uuid.v4},
            body: String,
            user: String,
            created: Date
        });
    

    mongoose.connect(process.env.MONGO_TEST_URI || "mongodb://localhost/kaster-mongoose-test");

    schema.plugin(kasterMongoose, {
        clientHost: process.env.KAFKA_TEST_HOST || "localhost:2181",
        immediate: true,
        namespace: "MyApp.Test",
        name: "Message",
        topic: "kaster-test"
    });

    var MessageModel = mongoose.model("Message", schema);
    var message_id, consumer;

    before(function(done){
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

        producer.on("ready", function(){

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

                MessageModel.remove({}, done);

            });
            
        });
        
    });

    it("should send a model to kafka on save", function(done){
        var message = new MessageModel({
            body: "Hello world!",
            user: "Mark",
            created: Date.now()
        });

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
        
        message.save(function(err, saved){
            if(err) throw err;
            message_id = saved._id;
            if(!INTEGRATION) return done();
        });
    });

    it("should send a delete model schema to kafka on remove", function(done){

        MessageModel.findOne({_id: message_id}, function(err, message){
            message.remove(function(err){
                if(err) throw err;
                if(!INTEGRATION) return done();
            });
        });

        var messageHandler = kaster.createMessageHandler(function(err, message, header){
            if(err) throw new Error(err);

            if(
                message && message_id && 
                message._id == message_id &&
                message.schema == "Message" && 
                header && header.meta && header.meta["avro.schema"] &&
                header.meta["avro.schema"].name == "Delete"
            ) {
                return done();
            }
        });

        consumer.on("message", messageHandler);
    });
});