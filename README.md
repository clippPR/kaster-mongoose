**Note:** This is a work in progress

[![Build Status](https://travis-ci.org/clippPR/kaster-mongoose.png)](https://travis-ci.org/clippPR/kaster-mongoose)

Mongoose plugin to stream data to Kafka with Avro serialization

##Example
```javascript
var 
    mongoose = require("mongoose"),
    kasterMongoose = require("kaster-mongoose"),
    schema = mongoose.Schema({
        body: String,
        user: String,
        created: Date
    });

schema.plugin(kasterMongoose, {
    clientHost: "localhost:2181",
    immediate: true,
    namespace: "MyApp.Test",
    name: "Message",
    topic: "kaster-test"
});

var MessageModel = mongoose.model("Message", schema);


var message = new MessageModel({
    body: "Hello world!",
    user: "Mark",
    created: Date.now()
});

message.save(); //After saving the message will be sent to Kafka

```

##TODO

* Write tests