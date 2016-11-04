var fs = require('fs')
var geojsonStream = require('geojson-stream')
var es = require('event-stream')
var fun = require('funcy');
var moment = require('moment')
var $ = fun.parameter;

/**
 * Stringifies a GeoJSON object into WKT
 */
function wkStringify (gj) {
  if (gj.type === 'Feature') {
    gj = gj.geometry;
  }

  function pairWKT (c) {
    return c.join(' ');
  }

  function ringWKT (r) {
    return r.map(pairWKT).join(', ');
  }

  function ringsWKT (r) {
    return r.map(ringWKT).map(wrapParens).join(', ');
  }

  function multiRingsWKT (r) {
    return r.map(ringsWKT).map(wrapParens).join(', ');
  }

  function wrapParens (s) { return '(' + s + ')'; }

  switch (gj.type) {
    case 'Point':
      return 'POINT (' + pairWKT(gj.coordinates) + ')';
    case 'LineString':
      return 'LINESTRING (' + ringWKT(gj.coordinates) + ')';
    case 'Polygon':
      return 'POLYGON (' + ringsWKT(gj.coordinates) + ')';
    case 'MultiPoint':
      return 'MULTIPOINT (' + ringWKT(gj.coordinates) + ')';
    case 'MultiPolygon':
      return 'MULTIPOLYGON (' + multiRingsWKT(gj.coordinates) + ')';
    case 'MultiLineString':
      return 'MULTILINESTRING (' + ringsWKT(gj.coordinates) + ')';
    case 'GeometryCollection':
      return 'GEOMETRYCOLLECTION (' + gj.geometries.map(stringify).join(', ') + ')';
    default:
      throw new Error('stringify requires a valid GeoJSON Feature or geometry object as input');
  }
}

const TYPES = {
	FLOAT : 'FLOAT',
	INT : 'INTEGER',
	STRING : 'TEXT',
	DATE : 'DATE',
	ANY : 'ANY'
}

var getTypeNotNull = fun(
	[undefined, x => {
		return TYPES.ANY;// NULL value
	}],
	[Number, x => x % 1 === 0 ? TYPES.INT : TYPES.FLOAT],
	[String, x => {
		if(!Number.isNaN(parseInt(x))){
			return TYPES.INT
		}else if(!Number.isNaN(parseFloat(x))){
			return TYPES.FLOAT;
		}else if(moment(x, moment.ISO_8601, true).isValid()){
			return TYPES.DATE;
		}else{
			return TYPES.STRING;
		}
	}],
	[$, x => {
		debugger
	}]
)

function getType(v){
	if(v == undefined){
		return TYPES.ANY
	}
	return getTypeNotNull(v)
}

var joinTypes = fun(
	[{t1 : TYPES.INT, t2 : TYPES.INT}, x => TYPES.INT],
	[{t1 : TYPES.INT,t2 : TYPES.FLOAT}, x => TYPES.FLOAT],
	[{t1 : TYPES.FLOAT, t2 : TYPES.INT}, x => TYPES.FLOAT],
	[{t1 : TYPES.FLOAT, t2 : TYPES.FLOAT}, x => TYPES.FLOAT],
	[{t1 : TYPES.DATE, t2 : TYPES.DATE}, x => TYPES.DATE],
	[{t1 : TYPES.STRING, t2 : $}, x => TYPES.STRING],
	[{t1 : $, t2 : TYPES.STRING}, x => TYPES.STRING],
	[{t1 : TYPES.ANY, t2 : $}, x => x],
	[{t1 : TYPES.DATE, t2 : TYPES.INT}, x => TYPES.INT],
	[{t1 : TYPES.INT, t2 : TYPES.DATE}, x => TYPES.INT],
	[{t1 : $, t2 : TYPES.ANY}, x => x],
	[$, x => {
		debugger
	}]
)

var joinValues = (v1, v2) => joinTypes({t1 : getType(v1), t2 : getType(v2)})

function getSchema(json){
	var features = json.features;
	var props = Object.keys(features[0].properties);
	var schema = {};
	for(var i = 0; i < features.length; i++){
		for(var key in features[i].properties){
			schema[key] = joinTypes({t1 : schema[key] ? schema[key] : TYPES.ANY, t2 : getType(features[i].properties[key])});
		}
	}
	return schema;
}

exports.getSchema = getSchema

/**
 * Process a GeoJSON file and generate a PostgreSQL
 * script to insert each feature into a database
 * @function 
 * @param {string} tablename - Name of table to create in the 
 * 		database (table should not already exist)
 * @param {string} file - Name of the input GeoJSON file
 * @param {Array<{name : string, type : string}>} schema - The schema
 * 		of the table to be created.  `name` is a column name and 
 * 		`type` is the type for that column
 * @param {function} emitRow - A function that takes in a single 
 * 		GeoJSON feature and returns an object where the keys are
 *      column names defined in the schema and the values are 
 *      the values to be entered into each column
 */
function copyToDB(args){
	// Create Postgres schema
	var schema = args.schema.map(function(col){
		return col.name + ' ' + col.type
	}).join(',')

	args.schema.push({name : 'geom', type : 'Polygon'})

	// Comma separated string of just the column names
	var colNames = args.schema.map(function(col){
		return col.name
	}).join(',')

	console.log('SET CLIENT_ENCODING TO UTF8;')
	console.log('SET STANDARD_CONFORMING_STRINGS TO ON;')
	console.log('BEGIN;')
	console.log(`DROP TABLE IF EXISTS ${args.tablename};`)
	console.log(`CREATE TABLE "${args.tablename}" (${schema});`)
	console.log(`SELECT AddGeometryColumn('','${args.tablename}','geom','4326','POLYGON',2);`)
	console.log(`COPY ${args.tablename} (${colNames}) FROM stdin;`)

	// Stream in the GeoJSON file
	var inStream = fs.createReadStream(args.file)
		.pipe(geojsonStream.parse()).pipe(es.mapSync(function(feature){
			var row = args.emitRow(feature)
			row.geom = `SRID=4326;${wkStringify(feature.geometry)}`
			console.log(args.schema.map(function(col){
				return row[col.name];
			}).join('\t'))		
		}))
	inStream.on('end', function(){
		console.log('\\.')
		console.log(`CREATE INDEX ON ${args.tablename} USING GIST(geom);`)
		console.log('COMMIT;\n')
	})	
}

module.exports.copyToDB = copyToDB