(function (d3, $, _) {
    'use strict';

    var MapView = function (el, options) {
        var getOption = function (name, fallback) {
            return options && options[name] || fallback;
        }

        this.el = el;
        this.data = getOption('data', {});
        this.width = getOption('width', 500);
        this.height = getOption('height', 500);
        this.projection = getOption('projection', d3.geo.path().projection());
    };

    _.extend(MapView.prototype, {

        render: function () {

            var path_gen = d3.geo.path().projection(this.projection); 
            d3.select(this.el)
            .append('g')
            .selectAll('path')
            .data(this.data.features)
            .enter().append('path')
            .attr('d', path_gen)
            .attr('stroke', 'gray')
            .attr('stroke-width', 1)
            .attr('fill', 'transparent')
            .append('title')
            .text(function(d) { 
                return d.properties && d.properties.name;
            });

        }
    });

    $(document).ready(function() { 

        var projection = d3.geo.mercator();
        projection.center([-122.5, 37.8]);
        projection.scale(280000);

        // _.each(["freeways", "neighborhoods"], function (name) {

        // });

        d3.json('/static/data/neighborhoods.json', function (data) {
            var mv = new MapView('#js-app-container', {
                data:data
                , projection: projection
            });
            mv.render(); 
        });

        var url = function () {
            var nextbus_base = 'http://webservices.nextbus.com/service/publicXMLFeed?';
            var nextbus_agency = '&a=sf-muni';

            return {
                routes: function () {
                    return nextbus_base+"command=routeList"+nextbus_agency;
                }
                , routeConfig: function (routeTag) {
                    return nextbus_base+"command=routeConfig"+nextbus_agency+"&r="+routeTag;
                }
            };
        }

        $.get(url().routes(), function(xml) { 
            var routes = $.xml2json(xml).route; 
            var get_stop_xy = function (stop) {
                return projection([
                                  parseFloat(stop.lon)
                                  , parseFloat(stop.lat)
                ]);
            };

            var nextbus_path_to_geojson = function (path) {
                var features = _.map(path, function (path) {
                    var coords = _.map(path.point, function (point) {
                        return [parseFloat(point.lon), parseFloat(point.lat)];
                    });

                    return {
                        type: "Feature"
                        , geometry: {
                            type: "LineString"
                            , coordinates: coords
                        }
                    };
                });

                return {
                    type: "FeatureCollection"
                    , features: features
                };
            }

            var stops_map = d3.map(), deferreds = [];
            _.each(routes, function (route) {
                var deferred = $.get(url().routeConfig(route.tag), function (xml) {
                    var rc = $.xml2json(xml);
                    stops_map.set(route.tag, rc.route.stop);
                    var data = nextbus_path_to_geojson(rc.route.path);
                    console.log(data); 
                    var mv = new MapView('#js-app-container', {
                        data: data                        
                        , projection: projection
                    });
                    mv.render();
                });
                deferreds.push(deferred);
            });


            $.when.apply(null, deferreds).then(function () {
                var stop_index = 0;

                var get_current_locations = function () {
                    return _.reduce(stops_map.values(), function (memo, stops) {
                        memo.push(stops[stop_index % stops.length]);
                        return memo;
                    }, []);
                };

                var curr_locs = get_current_locations();

                // console.log('n locs:', curr_locs.length);
                var circles = d3.select('#js-app-container')
                .append('g')
                .selectAll('circle')
                .data(curr_locs);

                circles.enter()
                .append('circle')
                .attr('cx', function (stop) {
                    return get_stop_xy(stop)[0];
                })
                .attr('cy', function (stop) {
                    return get_stop_xy(stop)[1];
                })
                .attr('r', 10);

                // circles.exit()
                //     .remove();
            
                var update_vehicles = function () {
                    curr_locs = get_current_locations();

                    circles.data(curr_locs)
                        .transition()
                        .attr('cx', function (stop) {
                            return get_stop_xy(stop)[0];
                        })
                        .attr('cy', function (stop) {
                            return get_stop_xy(stop)[1];
                        }); 
                }

                update_vehicles();
                window.setInterval(function () {
                    update_vehicles();
                    stop_index++;
                }, 1000);
            });
        });


        var refresh = function () {
            $.getJSON('/refresh', function (refresh) {
                if(refresh) {
                    document.location.reload();
                }
            });
        };

        window.setInterval(refresh, 500);


    });

})(d3, $, _);



