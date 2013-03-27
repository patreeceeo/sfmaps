(function (d3, $, _) {
    'use strict';

    var config = d3.map({
        show_routes: d3.map({
            F: true
            , 17: true
            , 90: true
            , 91: true
        })
        , use_live_data: true
        , alert_on_connection_error: false
    });
    
    $.ajaxSetup({
        error: _.once(function () {
            config.get('alert_on_connection_error') && 
                window.alert("There was an error contacting the NextBus server, loading cached data instead of live data.");
            console.log('error');
            config.set('use_live_data', false);
        })
        , timeout: 5000
    });

    var MapView = function (el, options) {
        var getOption = function (name, fallback) {
            return options && options[name] || fallback;
        }

        this.el = el;
        this.data = getOption('data', {});
        this.width = getOption('width', 500);
        this.height = getOption('height', 500);
        this.projection = getOption('projection', d3.geo.path().projection());
        this.fill = getOption('fill', 'transparent');
        this.stroke = getOption('stroke', 'black');
        this.strokeWidth = getOption('strokeWidth', '1');
        this.cssClass = getOption('cssClass', '');
    };

    _.extend(MapView.prototype, {

        render: function () {

            var path_gen = d3.geo.path().projection(this.projection); 
            d3.select(this.el)
            .append('g')
            .attr('class', this.cssClass)
            .selectAll('path')
            .data(this.data.features)
            .enter().append('path')
            .attr('d', path_gen)
            .attr('stroke', this.stroke)
            .attr('stroke-width', this.strokeWidth)
            .attr('fill', this.fill)
            .append('title')
            .text(function(d) { 
                return d.properties && d.properties.name;
            });

        }
    });

    $(document).ready(function() { 

        var projection = d3.geo.mercator();
        projection.center([-122.5, 37.788]);
        projection.scale(220000);

        d3.json(map_json_url, function (data) {
            var mv = new MapView('#js-app-container', {
                data:data
                , projection: projection
                , stroke: 'gray'
            });
            mv.render(); 
        });

        var url = function () {
            var nextbus_base = 'http://webservices.nextbus.com/service/publicXMLFeed?';
            var nextbus_agency = '&a=sf-muni';
            var use_live_data = config.get('use_live_data');
            console.log('use_live_data',use_live_data);

            return {
                routes: function () {
                    if(use_live_data) return nextbus_base+"command=routeList"+nextbus_agency;
                    return '/static/data/route_list.xml';
                }
                , routeConfig: function (routeTag) {
                    if(use_live_data) return nextbus_base+"command=routeConfig"+nextbus_agency+"&r="+routeTag;
                    return '/static/data/route_config.xml';
                }
                , vehicleLocations: function (routeTag, time) {
                    if(use_live_data) {
                        time = !_.isUndefined(time) ? time : (new Date()).getTime();
                        return nextbus_base+"command=vehicleLocations"+nextbus_agency+"&r="+routeTag+"&t="+time;
                    }
                    return '/static/data/vehicle_locations.xml';
                }
            };
        };

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


            var RouteView = function (route) {

                var that = this;
                this.route = route;

            };

            _.extend(RouteView.prototype, {
                show: function (show) {
                    var selection = $('.route-'+this.route.tag.replace(' ', '-'));
                    if(show) {
                        this.rendered && selection.show() || this.render();
                        this.rendered = true;
                    } else {
                        selection.hide();
                    } 
                }
                , render: function () {
                    var that = this;

                    var get_vehicle_locations = function (cb) {
                        $.get(url().vehicleLocations(that.route.tag, 0), function (xml) {
                            var locs = $.xml2json(xml);
                            cb(locs);
                        }, 'xml');
                    };

                    var circles = d3.select('#js-app-container');

                    var create_circles = function (locs) {
                        if(locs.vehicle) {
                            circles = circles.append('g')
                            .attr('class', 'route-'+that.route.tag.replace(' ', '-'))
                            .selectAll('circle')
                            .data(locs.vehicle);

                            circles.enter()
                            .append('circle')
                            .attr('cx', function (stop) {
                                return get_stop_xy(stop)[0];
                            })
                            .attr('cy', function (stop) {
                                return get_stop_xy(stop)[1];
                            })
                            .attr('r', 5)
                            .attr('fill', '#'+that.color);
                        }
                    };

                    $.get(url().routeConfig(this.route.tag), function (xml) {
                        var rc = $.xml2json(xml);
                        var data = nextbus_path_to_geojson(rc.route.path);
                        that.map_view = new MapView('#js-app-container', {
                            data: data                        
                            , projection: projection
                            , stroke: '#'+rc.route.color
                            , cssClass: 'route-'+that.route.tag.replace(' ','-')
                        });
                        that.map_view.render();
                        that.color = rc.route.color;

                        get_vehicle_locations(create_circles);
                    }, 'xml');

                    var update_vehicles = function (locs) {
                        if(locs.vehicle) {
                            circles = circles.data(locs.vehicle);

                            circles
                            .attr('cx', function (stop) {
                                return get_stop_xy(stop)[0];
                            })
                            .attr('cy', function (stop) {
                                return get_stop_xy(stop)[1];
                            }); 
                        }
                    };

                    this.interval_id = window.setInterval(function () {
                        console.log('here!');
                        get_vehicle_locations(update_vehicles);
                    }, 10000);
                }

            });


            var route_view_map = d3.map();
            _.each(routes, function (route) {

                // create controls
                var render_route_buttons = function () {
                    console.log('creating button',route.tag);
                    var active = config.get('show_routes').get(route.tag.replace(' ', '-')) ? ' active':'';

                    $('#controls').append('<button type="button" class="btn toggle-route-button'+active+'" data-route-tag='+route.tag.replace(' ', '-')+'>'+route.tag+'</button>');
                }();

                var rv = new RouteView(route);
                rv.show(config.get('show_routes').get(route.tag));
                route_view_map.set(route.tag.replace(' ', '-'), rv);
            });

            $('.toggle-route-button').click(function () {
                var route_tag = $(this).data('routeTag');
                console.log('route_tag:',route_tag);
                var toggle = function(map, key) {
                    map.set(key, !map.get(key));
                };
                toggle(config.get('show_routes'), route_tag);
                route_view_map.get(route_tag).show(config.get('show_routes').get(route_tag));
                $(this).toggleClass('active');  
            });

        }, 'xml');


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



