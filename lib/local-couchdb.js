
var MyStreams = require('./streams')
var Error     = require('http-errors')

var HttpsAgent = require('agentkeepalive').HttpsAgent;
var myagent = new HttpsAgent({
    maxSockets: 50,
    maxKeepAliveRequests: 0,
    maxKeepAliveTime: 30000
  });

var UTIL_TAG = 'sinopiaUtils';
var env = require('./config-bluemix')('UTIL_TAG');
var cloudantOptions = env.get('cloudant');

var user = cloudantOptions.account;
var pass = cloudantOptions.password;


var nano      = require('nano')({
									'url' : 'https://'+ user +':'+ pass +'@' +  user +'.cloudant.com',
									"requestDefaults" : { "agent" : myagent }	
								}
								);
var fs         = require('fs')

function NanoError(code) {
  var err = Error(code)
  err.code = code
  return err
}

module.exports.create_json = create_json;

function create_json (name, value, cb) {
  console.log("local-couchdb.create_json name", [name, value.name]);
  document_exists(value.name, function(err, headers){
  		if(err && err.statusCode == 404){
  			write_json(name, value, /*revision*/ null, cb);
  		}else{
  			cb( NanoError(409) )
  		}
  });
}

module.exports.update_json = function(name, value, cb) {
  console.log("local-couchdb.update_json name", [name, value]);
  read_json(name, function(err, body){
	if(headers.statusCode != 404){
		write_json(name, value, body["_rev"], cb);
	}else{
		cb( NanoError(404) )
	}
  });
}

module.exports.delete_json = delete_json;
function delete_json (data, cb) {
  console.log("local-couchdb.delete_json name", [data.package.name, data['_rev']]);
  
  var sinopia = nano.db.use('sinopia');
  sinopia.destroy(data.package.name, data["_rev"] , function(err, body, header) {
    if (!err) {
      console.log('[local-couchdb.delete_json] ', [body]);
      return cb() ;
    }else{
    	return cb();
    }
  });
}


module.exports.write_json = write_json;
function write_json (name, value, revision, cb) {
  console.log("local-couchdb.write_json name", [name, revision]);
  
  var sinopia = nano.db.use('sinopia');
  var payload = { "_id": value.name, "timestamp" :  Date.now(),  "package": value, "docType" : "package.json"};
  if(revision){
  	payload ["_rev"] = revision;		//update code flow
  }

  sinopia.insert( payload , function(err, body, header) {
    if (!err) {
      console.log('[local-couchdb.write_json.insert] ', [body]);
      return cb() ;
    }else{
    	return cb();
    }
  });
}

module.exports.read_json = function(name, cb) {
  console.log("local-couchdb.read_json name", [name]);
  var self = this;
   self.document_exists(name, function(err, headers){
		if(err && err.statusCode == 404){
			cb( NanoError('ENOENT') );
		}else{
		  var sinopia = nano.db.use('sinopia');
		  sinopia.get(name, function(err, body) {
		    if (err) {
		      console.log('local-couchdb.read_json name  error', [name, err.message]);
		      cb( NanoError('ENOENT') )
		    }else{
		      console.log('local-couchdb.read_json name retrieved  ', name)
		      //console.log(body.package);
		      cb(err, body)
		    }
		  });
		}
	});
}

module.exports.read_stream = function (name, stream, callback) {
	console.log("local-couchdb.read_stream", [name, stream, callback ]);


	var sinopia = nano.db.use('sinopia');
	var stream = MyStreams.ReadTarballStream()
	var self = this;
	sinopia.attachment.get(name, name, function(err, body){
		if(err){
			stream.emit('error', Error[404]('no such file available'))
		 }else{
			console.log("local-couchdb.read_stream name entrance body size", body && body.length)
			stream.emit('open')
			stream.emit('content-length', body?body.length:-1)
			stream.end(body);
		}
	});
	return stream;
}

module.exports.write_stream = function (name) {
	console.log("local-couchdb.write_stream", [name ]);
	
	var stream = MyStreams.UploadTarballStream()

	fs.exists(name, function(exists) {
	    if (exists) return stream.emit('error', FSError('EEXISTS'))
		var sinopia = nano.db.use('sinopia');
		
		stream.emit('open')
		stream.pipe(
				sinopia.attachment.insert(name, name, null, 'application/x-compressed', {"docType" : "tarball"} ) 
		)
		
		stream.emit('success')
		console.log("local-couchdb.write_stream name exit", [name]);
	});
	return stream
}

module.exports.delete_stream = function (name, callback) {
	console.log("local-couchdb.delete_stream", [name ]);
	var sinopia = nano.db.use('sinopia');
	sinopia.get(name, name, function(err, body){
		if(!err){
		 	// console.log('attempting to delete body.rev', body.rev);
		 	// console.log('attempting to delete body', body);
			sinopia.destroy(name,
			    body._rev, function(err, body) {
			      if (!err){
			        console.log('local-couchdb.delete_stream deleted', body);
			    }
			});
		}
		if(callback){
			return callback();
		}
	});
}




module.exports.document_exists = document_exists;

function document_exists (name, cb) {
  console.log("local-couchdb.document_exists name", [name, cb]);
  var sinopia = nano.db.use('sinopia');
  sinopia.head(name, function(err, _, headers) {
    if(cb){
      cb(err, headers);
    }
  });
}

module.exports.list_packages = list_packages;
function list_packages (callback) {
  	var sinopia = nano.db.use('sinopia');
  	sinopia.view('nodepackages', 'list_node_packages', function(err, body) {
	  if (!err) {
	    body.rows.forEach(function(doc) {
	      console.log("local-couchdb.list_packages", [doc.key, doc.value]);
	    });
	  }else{
	  	console.log('error!!!', err);
	  }
	  callback(err, body.rows);
	});
}


var createDBIfNecessary = function (){
  	nano.db.create('sinopia', function(err, body) {
	  if (!err) {
	    console.log('database sinopia created!');
	     var sinopia = nano.db.use('sinopia');
		  sinopia.insert(
		  { "views": 
		    { "list_node_packages": 
		      { "map": function (doc){  var docType = doc['docType'];     if(docType == 'package.json'){        emit ( doc['package']['name'], doc.timestamp  );     }} } 
		    }
		  }, '_design/nodepackages', function (error, response) {
	     });
	  }
	});
}


module.exports.unlink = function (filename, callback) {
	// required API when we were using filesystem calls
	if(callback){
		return callback();
	}
}

createDBIfNecessary();


