var producer;

var KasterMongoose = function(schema, options){

    var kaster = require("kaster");
    
    if(!options) options = {};

    if(!producer) producer = kaster.createProducer({
        namespace: options.namespace || "mongoose",
        clientHost: options.clientHost || "localhost:2181",
        immediate: (options.immediate === null) ?  true : options.immediate
    });

    if(!options.name) throw new Error("A name is a required option (Ex: {name: 'MyModel'}).");

    schema.post("save", function(){

        var that = this.toObject();

        if(producer.ready) kaster.send({
            topic: options.topic || "kaster-topic",
            name: options.name
        }, that, function(err, data){

            if(err) console.warn("Kaster Error (Kafka is probably not running):", err.stack || err);
        });

    });

    schema.post("remove", function(){
        var that = this.toObject();
        var message = {
            _id: that._id,
            schema: options.name
        };

        kaster.send({
            topic: options.topic || "kaster-topic",
            name: "Delete",
            type: "record"
        }, 
        message,
        function(err, data){
            if(err) console.warn("Kaster Error (Kafka is probably not running):", (err.stack || err));
        });
    });

};

module.exports = KasterMongoose;

