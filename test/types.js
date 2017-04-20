"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var helpers_1 = require("@turf/helpers");
var buffer = require("../");
var pt = helpers_1.point([100, 0]);
buffer(pt, 5, 'miles');
buffer(pt, 10, 'miles', 64);
