var KasterMongoose = function(schema, options){

    var kaster = require("kaster");
    
    if(!options) options = {};

    kaster.init({
        namespace: options.namespace || "mongoose",
        clientHost: options.clientHost || "localhost:2181",
        immediate: (options.immediate === null) ?  true : options.immediate
    });

    if(!options.name) throw new Error("A name is a required option (Ex: {name: 'MyModel'}).");

    schema.post("save", function(){

        var that = this.toObject();

        kaster.send({
            topic: options.topic || "kaster-topic",
            name: options.name
        }, that, function(err, data){
            if(err) {
                console.log("Kaster:", err.stack || err);
                console.log(that);
            }
        });

    });

};

module.exports = KasterMongoose;

