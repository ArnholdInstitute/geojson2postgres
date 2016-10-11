#!/usr/bin/env node
var fs = require('fs')
var geojsonStream = require('geojson-stream')
var es = require('event-stream')
var wk = require('wellknown')

if(process.argv.length < 3){
	console.log('usage: geojson2postges <filename>')
	process.exit(1)
}

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
	// Comma separated string of just the column names
	var colNames = args.schema.map(function(col){
		return col.name
	}).join(',')

	console.log('SET CLIENT_ENCODING TO UTF8;')
	console.log('SET STANDARD_CONFORMING_STRINGS TO ON;')
	console.log('BEGIN;')
	console.log(`DROP TABLE IF EXISTS ${args.tablename};`)
	console.log(`CREATE TABLE "${args.tablename}" (${schema});`)
	console.log(`COPY ${args.tablename} (${colNames}) FROM stdin;`)

	// Stream in the GeoJSON file
	var inStream = fs.createReadStream(args.file)
		.pipe(geojsonStream.parse()).pipe(es.mapSync(function(feature){
			var row = args.emitRow(feature)
			var elements = args.schema.map(function(col){
				return row[col.name];
			})
			elements.push(`SRID=4326;${wk.stringify(feature.geometry)}`)
			console.log(elements.join('\t'));		
		}))
	inStream.on('end', function(){
		console.log('\\.\nCOMMIT;\n')
	})	
}