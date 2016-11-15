geojson2postgres
-------------

Copy a geojson file to PostgreSQL

This package supports both a command line interface as well as a programmable API.

## Command Line

To install:

`npm install -g geojson2postgres`

To run:

`geojson2postgres <filename> <args> | psql <db>`

```
args:
  --create (-c): drop the database if it exists and recreate it
  --file (-f) <filename>: the GeoJSON file to be processed
  --tablename (-t) <tablename>: the name of the SQL table to be created (defaults to the name of the GeoJSON file)
```


## API
<a name="copyToDB"></a>

### copyToDB(tablename, file, schema, emitRow)
Process a GeoJSON file and generate a PostgreSQL
script to insert each feature into a database

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| tablename | <code>string</code> | Name of table to create in the  		database (table should not already exist) |
| file | <code>string</code> | Name of the input GeoJSON file |
| schema | <code>Array.&lt;{name: string, type: string}&gt;</code> | The schema 		of the table to be created.  `name` is a column name and  		`type` is the type for that column |
| emitRow | <code>function</code> | A function that takes in a single  		GeoJSON feature and returns an object where the keys are      column names defined in the schema and the values are       the values to be entered into each column |

#### Example

```Javascript
copyToDB({
	tablename : 'columbian_municipalities',
	file : process.argv[2],
	schema : [{name : 'department', type : 'text'}, {name : 'municipality', type : 'text'}],
	emitRow : function(feature){
		return {
			municipality : feature.properties.NOMBRE_MPI,
			department : feature.properties.NOMBRE_DPT
		};
	},
})
```

Where the json file looks something like:

```
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
    }
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "AREA": 7516765785.590000,
        "PERIMETER": 475636.130236,
        "WCOLGEN02_": 2,
        "WCOLGEN021": 566,
        "DPTO": "44",
        "NOMBRE_DPT": "LA GUAJIRA",
        "MPIO": "847",
        "NOMBRE_MPI": "URIBIA",
        "NOMBRE_CAB": "URIBIA",
        "CLASEMUN": "CM",
        "MPIOS": "44847",
        "ZONA": "ZONA06",
        "OF_REG": "DABAR",
        "REG_ZONAS": "DABARZONA06",
        "HECTARES": 751676.579000
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              -71.416042649212045,
              11.786808467660752
            ],
    		...
            [
              -71.416042649212045,
              11.786808467660752
            ]
          ]
        ]
      }
    }
  ]
}
```
