describe("Kaster Mongoose", function(){
    
    var 
        mongoose = require("mongoose"),
        kasterMongoose = require("../lib"),
        schema = mongoose.Schema({
            body: String,
            user: String,
            created: Date
        });

    mongoose.connect(process.env.MONGO_TEST_URI || "mongodb://localhost/kaster-mongoose-test");

    schema.plugin(kasterMongoose, {
        clientHost: "localhost:2181",
        immediate: true,
        namespace: "MyApp.Test",
        name: "Message",
        topic: "kaster-test"
    });

    var MessageModel = mongoose.model("Message", schema);
    var message_id;

    it("should send a model to kafka on save", function(done){
        var message = new MessageModel({
            body: "Hello world!",
            user: "Mark",
            created: Date.now()
        });

        message.save(function(err, saved){
            message_id = saved._id;
            return done();
        });
    });
    it("should send a remove model schema to kafka on remove");
});