import { actionDeleteNode } from './delete_node';
import _difference from 'lodash-es/difference';

import {
    geoVecInterp,
    geoVecLength
} from '../geo';


/*
 * Based on https://github.com/openstreetmap/potlatch2/net/systemeD/potlatch2/tools/Straighten.as
 */
export function actionStraighten(wayIds, projection) {

    function positionAlongWay(n, s, e) {
        return ((n[0] - s[0]) * (e[0] - s[0]) + (n[1] - s[1]) * (e[1] - s[1])) /
                (Math.pow(e[0] - s[0], 2) + Math.pow(e[1] - s[1], 2));
    }

    // Return all ways as a continuous, ordered array of nodes
    var getAllNodes = function(graph) {
        var nodes = [],
            startNodes = [],
            endNodes = [],
            ways = {};

        for (var i = 0; i < wayIds.length; i++) {
            var way = graph.entity(wayIds[i]);
                nodes = graph.childNodes(way);
                ways[nodes[0].id] = nodes;
                startNodes.push(nodes[0]);
                endNodes.push(nodes[nodes.length-1]);
        }

        var startNode = _difference(startNodes, endNodes)[0],
            endNode = _difference(endNodes, startNodes)[0];

        nodes = ways[startNode.id];

        while (nodes[nodes.length-1] !== endNode) {
            var lastNode = nodes[nodes.length-1];
                nodes = nodes.concat(ways[lastNode.id]);
        }

        return nodes;
    };


    var action = function(graph, t) {
        if (t === null || !isFinite(t)) t = 1;
        t = Math.min(Math.max(+t, 0), 1);

        var nodes = getAllNodes(graph),
            points = nodes.map(function(n) { return projection(n.loc); }),
            startPoint = points[0],
            endPoint = points[points.length-1],
            toDelete = [],
            i;

        for (i = 1; i < points.length-1; i++) {
            var node = nodes[i],
                point = points[i];

            if (t < 1 || graph.parentWays(node).length > 1 ||
                graph.parentRelations(node).length ||
                node.hasInterestingTags()) {

                var u = positionAlongWay(point, startPoint, endPoint),
                    p = [
                        startPoint[0] + u * (endPoint[0] - startPoint[0]),
                        startPoint[1] + u * (endPoint[1] - startPoint[1])
                    ],
                    loc2 = projection.invert(p);

                graph = graph.replace(node.move(geoVecInterp(node.loc, loc2, t)));

            } else {
                // safe to delete
                if (toDelete.indexOf(node) === -1) {
                    toDelete.push(node);
                }
            }
        }

        for (i = 0; i < toDelete.length; i++) {
            graph = actionDeleteNode(toDelete[i].id)(graph);
        }

        return graph;
    };


    action.disabled = function(graph) {
        // check way isn't too bendy
        var nodes = getAllNodes(graph),
            points = nodes.map(function(n) { return projection(n.loc); }),
            startPoint = points[0],
            endPoint = points[points.length-1],
            threshold = 0.2 * geoVecLength(startPoint, endPoint),
            i;

        if (threshold === 0) {
            return 'too_bendy';
        }

        for (i = 1; i < points.length-1; i++) {
            var point = points[i],
                u = positionAlongWay(point, startPoint, endPoint),
                p0 = startPoint[0] + u * (endPoint[0] - startPoint[0]),
                p1 = startPoint[1] + u * (endPoint[1] - startPoint[1]),
                dist = Math.sqrt(Math.pow(p0 - point[0], 2) + Math.pow(p1 - point[1], 2));

            // to bendy if point is off by 20% of total start/end distance in projected space
            if (isNaN(dist) || dist > threshold) {
                return 'too_bendy';
            }
        }
    };


    action.transitionable = true;


    return action;
}
