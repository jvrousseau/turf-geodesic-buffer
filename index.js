var destination = require('@turf/destination');
var bearing = require('@turf/bearing');
var featureEach = require('@turf/meta').featureEach;
var coordEach = require('@turf/meta').coordEach;
var helpers = require('@turf/helpers');
var point = helpers.point;
var polygon = helpers.polygon;
var lineString = helpers.lineString;
var featureCollection = helpers.featureCollection;
var union = require('@turf/union');
var polygonToLineString = require('@turf/polygon-to-linestring');

module.exports = function (geojson, radius, units, resolution) {
    // validation
    if (radius === undefined || radius === null) throw new Error('radius is required');

    // default params
    resolution = resolution || 64;

    switch (geojson.type) {
    case 'GeometryCollection':
    case 'FeatureCollection':
        var results = [];
        var features = (geojson.features) ? geojson.features : geojson.geometries || [];

        features.forEach(function (feature) {
            featureEach(buffer(feature, radius, units, resolution), function (buffered) {
                results.push(buffered);
            });
        });
        return featureCollection(results);
    }
    return buffer(geojson, radius, units, resolution);
};

function buffer(feature, radius, units, resolution) {
    var properties = feature.properties || {};
    var geometry = (feature.type === 'Feature') ? feature.geometry : feature;

    switch (geometry.type) {
    case 'Point':
        var poly = pointBuffer(feature, radius, units, resolution);
        poly.properties = properties;
        return poly;
    case 'MultiPoint':
        var multi_points = [];
        coordEach(feature, function (coord) {
            var poly = pointBuffer(point(coord, properties), radius, units, resolution);
            poly.properties = properties;
            multi_points.push(poly);
        });
        return featureCollection(multi_points);
    case 'LineString':
        return featureCollection([lineBuffer(feature, radius, units, resolution, properties)]);
    case 'MultiLineString':
        var multi_lines = [];
        geometry.coordinates.forEach(function (line) {
            var ls = lineString(line);
            ls.properties = properties;
            multi_lines.push(buffer(ls, radius, units, resolution).features[0]);
        });
        return featureCollection(multi_lines);
    case 'Polygon':
        var tmp = polygonToLineString(feature)
        tmp = (tmp.type === 'Feature') ? tmp : tmp.features[0];
        tmp.properties = properties;
        return featureCollection([union(buffer(tmp, radius, units, resolution).features[0], feature)]);
    case 'MultiPolygon':
        var multi_polys = [];
        geometry.coordinates.forEach(function (poly) {
            var line = polygonToLineString(polygon(poly));
            line = (line.type === 'Feature') ? line : line.features[0];
            line.properties = properties;
            multi_polys.push(union(buffer(line, radius, units, resolution).features[0], feature));
        });
        return featureCollection(multi_polys);
    default:
        throw new Error('geometry type ' + geometry.type + ' not supported');
    }
}

function pointBuffer(pt, radius, units, resolution) {
    var ring = [];
    var resMultiple = 360 / resolution;
    for (var i  = 0; i < resolution; i++) {
        var spoke = destination(pt, radius, i * resMultiple, units);
        ring.push(spoke.geometry.coordinates);
    }
    if ((ring[0][0] !== ring[ring.length - 1][0]) && (ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([ring[0][0], ring[0][1]]);
    }
    return polygon([ring]);
}

function lineBuffer(line, radius, units, resolution, properties) {
    var lineBuffers = [];
    //break line into segments
    var segments = [];
    for (var i = 0; i < line.geometry.coordinates.length - 1; i++) {
        segments.push([line.geometry.coordinates[i], line.geometry.coordinates[i + 1]]);
    }
  /*create a set of boxes parallel to the segments
    ---------

 ((|¯¯¯¯¯¯¯¯¯|))
(((|---------|)))
 ((|_________|))

  */
    for (var i = 0; i < segments.length; i++) {
        var bottom = point([segments[i][0][0], segments[i][0][1]]);
        var top = point([segments[i][1][0], segments[i][1][1]]);

        var direction = bearing(bottom, top);

        var bottomLeft = destination(bottom, radius, direction - 90, units);
        var bottomRight = destination(bottom, radius, direction + 90, units);
        var topLeft = destination(top, radius, direction - 90, units);
        var topRight = destination(top, radius, direction + 90, units);

        //var poly = polygon([[bottomLeft.geometry.coordinates, topLeft.geometry.coordinates, topRight.geometry.coordinates, bottomRight.geometry.coordinates, bottomLeft.geometry.coordinates]]);
        var coords = [topLeft.geometry.coordinates];
        // add top curve
        var spokeNum = Math.floor(resolution / 2);
        var topStart = bearing(top, topLeft);
        for (var k = 1; k < spokeNum; k++) {
            var spokeDirection = topStart + (180 * (k / spokeNum));
            var spoke = destination(top, radius, spokeDirection, units);
            coords.push(spoke.geometry.coordinates);
        }
        coords.push(topRight.geometry.coordinates);
        coords.push(bottomRight.geometry.coordinates);
        //add bottom curve
        var bottomStart = bearing(bottom, bottomRight);
        for (var k = 1; k < spokeNum; k++) {
            var spokeDirection = (bottomStart + (180 * (k / spokeNum)))
            var spoke = destination(bottom, radius, spokeDirection, units);
            coords.push(spoke.geometry.coordinates);
        }
        coords.push(bottomLeft.geometry.coordinates);
        coords.push(topLeft.geometry.coordinates);
        lineBuffers.push(polygon([coords]));
    }
    var lineBuff = union.apply(this, lineBuffers);
    lineBuff.properties = properties;
    return lineBuff;
}
