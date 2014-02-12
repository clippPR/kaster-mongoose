var kaster = require("kaster");

var subDocumentToId = function(schema, obj) {
    for(var i in schema.paths){
        if(
            schema.paths[i].options.ref && 
            obj[i] !== null &&
            typeof obj[i] !== "undefined" &&
            obj[i]._id
        ) {
            obj[i] = obj[i]._id
        }
    }

    return obj;
}

var KasterMongoose = function(schema, options){
    
    if(!options) options = {};

    if(!options.name) throw new Error("A name is a required option (Ex: {name: 'MyModel'}).");

    var _sendToKaster = function(json, cb) {
        json = (json.toObject) ? json.toObject() : json;

        var obj = subDocumentToId(schema, json);

        kaster.send({
            topic: options.topic || "kaster-topic",
            name: options.name,
            namespace: options.namespace,
            region: options.region || "us-east-1"
        }, obj, cb);
    };

    schema.post("save", function(){
        setImmediate(function(){
            _sendToKaster(this, function(err, data){
                 if(err) console.warn("Kaster Error:", err.stack || err);
            });
        });
    });

    schema.post("remove", function(){
        var that = this.toObject();
        var message = {
            _id: that._id,
            schema: options.name
        };

        setImmediate(function(){
            kaster.send({
                topic: options.topic || "kaster-topic",
                name: "Delete",
                type: "record",
                namespace: options.namespace,
                region: options.region || "us-east-1"
            }, 
            message,
            function(err, data){
                if(err) console.warn("Kaster Error:", (err.stack || err));
            });
        });
    });

    schema.statics.kasterSync = function(cb){
        var self = this, errors = [], docCount = 0;

        var docStream = self.find().stream();

        docStream.on("data", function (doc) {
            if (!doc || !doc._id) return;
            docCount++;
            // docStream.pause();
            _sendToKaster(doc, function(err, data){
                if(err) errors.push(err);
                // docStream.resume();
            });
        });

        docStream.on("close", function(err){
            if(err) errors.push(err);
            return cb((errors.length > 0) ? errors : null, docCount);
        });

        docStream.on("error", function(err){
            errors.push(err);
        });
    };

};

module.exports = KasterMongoose;

