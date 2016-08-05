/*
    BRouter web - web client for BRouter bike routing engine

    Licensed under the MIT license.
*/

(function() {

    var map,
        layersControl;

    function initMap() {
        L.Icon.Default.imagePath = 'dist/images';

        var maxZoom = 19;

        var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: maxZoom
        });

        var osmde = L.tileLayer('http://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
            maxNativeZoom: 18,
            maxZoom: maxZoom
        });

        var topo = L.tileLayer('http://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxNativeZoom: 17,
            maxZoom: maxZoom
        });

        var cycle = L.tileLayer('http://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png', {
            maxNativeZoom: 18,
            maxZoom: maxZoom
        });
        var outdoors = L.tileLayer('http://{s}.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png', {
            maxNativeZoom: 18,
            maxZoom: maxZoom
        });

        var cycling = L.tileLayer('http://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
          maxNativeZoom: 18,
          maxZoom: maxZoom,
          opacity: 0.7
        });
        var hiking = L.tileLayer('http://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
          maxNativeZoom: 18,
          maxZoom: maxZoom,
          opacity: 0.7
        });

        // COPYING: Please get your own Bing maps key at http://www.microsoft.com/maps/default.aspx
        if (BR.conf.bingKeyUrl) {
            var bing = new BR.BingLayer();
            BR.Util.get(BR.conf.bingKeyUrl, function (err, key) {
                if (err) {
                    layersControl.removeLayer(bing);
                    return;
                }

                bing._key = key;
                bing.loadMetadata();
            });
        }

        map = new L.Map('map', {
            worldCopyJump: true
        });
        if (!map.restoreView()) {
          map.setView([50.99, 9.86], 6);
        }
        map.attributionControl.setPrefix(false);
        map.attributionControl.addAttribution('<a href="" data-toggle="modal" data-target="#credits">Copyright & credits</a>')

        var baseLayers = {
            'OpenStreetMap': osm,
            'OpenStreetMap.de': osmde,
            'OpenTopoMap': topo,
            'OpenCycleMap (Thunderf.)': cycle,
            'Outdoors (Thunderforest)': outdoors
        };
        if (BR.conf.bingKeyUrl) {
            baseLayers['Bing Aerial'] = bing
        }
        var overlays = {
             'Cycling (Waymarked Trails)': cycling,
             'Hiking (Waymarked Trails)': hiking
        };

        if (BR.conf.clearBaseLayers) {
            baseLayers = {};
        }
        for (i in BR.conf.baseLayers) {
            if (BR.conf.baseLayers.hasOwnProperty(i)) {
                baseLayers[i] = L.tileLayer(BR.conf.baseLayers[i]);
            }
        }

        for (i in BR.conf.overlays) {
            if (BR.conf.overlays.hasOwnProperty(i)) {
                overlays[i] = L.tileLayer(BR.conf.overlays[i]);
            }
        }
        // after applying custom base layer configurations, add first base layer to map
        var firstLayer = baseLayers[Object.keys(baseLayers)[0]];
        if (firstLayer) {
            map.addLayer(firstLayer);
        }

        layersControl = L.control.layers(baseLayers, overlays).addTo(map);

        // expose map instance for console debugging
        BR.debug = BR.debug || {};
        BR.debug.map = map;
    }

    function initApp() {
        var search,
            router,
            routing,
            routesLayer,
            routingOptions,
            nogos,
            stats,
            itinerary,
            elevation,
            download,
            profile,
            trackMessages,
            routingToolbar,
            permalink,
            leftPaneId = 'leftpane',
            saveWarningShown = false;

        // left sidebar as additional control position
        map._controlCorners[leftPaneId] = L.DomUtil.create('div', 'leaflet-' + leftPaneId, map._controlContainer);

        L.control.locate({
            icon: 'glyphicon glyphicon-screenshot',
            iconLoading: 'glyphicon glyphicon-refresh',
        }).addTo(map);

        search = new BR.Search();
        // map.addControl(search);

        router = L.bRouter(); //brouterCgi dummyRouter

        drawButton = L.easyButton({
            states: [{
                stateName: 'deactivate-draw',
                icon: 'glyphicon-ok',
                onClick: function (control) {
                    routing.draw(false);
                    control.state('activate-draw');
                },
                title: 'Stop drawing route'
            }, {
                stateName: 'activate-draw',
                icon: 'glyphicon-road',
                onClick: function (control) {
                    routing.draw(true);
                    control.state('deactivate-draw');
                },
                title: 'Draw route'
            }]
        });

        deleteButton = L.easyButton(
            'glyphicon-trash',
            function () {
                bootbox.confirm({
                    size: 'small',
                    message: "Delete route?",
                    callback: function(result) {
                        if (result) {
                            routing.clear();
                            onUpdate();
                            permalink._update_routing();
                        }
                    }
                });
            },
            'Clear route'
        );

        drawToolbar = L.easyBar([drawButton, deleteButton]).addTo(map);

        function updateRoute(evt) {
            router.setOptions(evt.options);

            // abort pending requests from previous rerouteAllSegments
            if (!router.queue.idle()) {
                router.queue.kill();
            }
            routing.rerouteAllSegments(onUpdate);
        }

        function requestUpdate(updatable) {
            var track = routing.toPolyline(),
                segments = routing.getSegments();

            updatable.update(track, segments);
        }

        routingOptions = new BR.RoutingOptions();
        routingOptions.on('update', updateRoute);
        routingOptions.on('update', function(evt) {
            profile.update(evt.options);
        });

        nogos = new BR.NogoAreas();
        nogos.on('update', updateRoute);

        // intermodal routing demo?
        if (BR.conf.transit) {
            itinerary = new BR.Itinerary();
        } else {
            stats = new BR.TrackStats();
        }
        download = new BR.Download();
        elevation = new BR.Elevation();
        profile = new BR.Profile();
        profile.on('update', function(evt) {
            BR.message.hide();
            var profileId = routingOptions.getCustomProfile();
            router.uploadProfile(profileId, evt.profileText, function(err, profileId) {
                if (!err) {
                    routingOptions.setCustomProfile(profileId, true);
                    updateRoute({
                        options: routingOptions.getOptions()
                    });
                    if (!saveWarningShown) {
                        profile.message.showWarning('<strong>Note:</strong> Uploaded custom profiles are only cached temporarily on the server.'
                            + '<br/>Please save your edits to your local PC.');
                        saveWarningShown = true;
                    }
                } else {
                    profile.message.showError(err);
                    if (profileId) {
                        routingOptions.setCustomProfile(profileId, true);
                        router.setOptions(routingOptions.getOptions());
                    }
                }

                if (evt.callback) {
                    evt.callback();
                }
            });
        });
        profile.on('clear', function(evt) {
            profile.message.hide();
            routingOptions.setCustomProfile(null);
        });
        trackMessages = new BR.TrackMessages({
            requestUpdate: requestUpdate
        });

        routing = new BR.Routing({
            routing: {
                router: L.bind(router.getRouteSegment, router)
            },
            styles: {
                trailer: {
                    dashArray: [10, 10],
                    opacity: 0.6,
                    color: 'magenta'
                },
                track: {
                    color: 'magenta',
                    opacity: BR.conf.defaultOpacity
                },
                trackCasing: {
                    weight: 8,
                    color: 'white',
                    // assumed to be same as track, see setOpacity
                    opacity: BR.conf.defaultOpacity
                },
                nodata: {
                    color: 'darkred'
                }
            }
        });

        routing.on('routing:routeWaypointEnd routing:setWaypointsEnd', function(evt) {
            search.clear();
            onUpdate(evt && evt.err);
        });
        map.on('routing:draw-start', function() {
            drawButton.state('deactivate-draw');
        });
        map.on('routing:draw-end', function() {
            drawButton.state('activate-draw');
        });

        function onUpdate(err) {
            if (err) {
                if (err !== L.BRouter.ABORTED_ERROR) {
                    BR.message.showError(err);
                }
                return;
            } else {
                BR.message.hide();
            }

            var track = routing.toPolyline(),
                segments = routing.getSegments(),
                latLngs = routing.getWaypoints(),
                segmentsLayer = routing._segments,
                urls = {};

            elevation.update(track, segmentsLayer);
            if (BR.conf.transit) {
                itinerary.update(track, segments);
            } else {
                stats.update(track, segments);
            }
            trackMessages.update(track, segments);

            if (latLngs.length > 1) {
                urls.gpx = router.getUrl(latLngs, 'gpx');
                urls.kml = router.getUrl(latLngs, 'kml');
                urls.geojson = router.getUrl(latLngs, 'geojson');
                urls.csv = router.getUrl(latLngs, 'csv');
            }

            download.update(urls);
        };

        if (!BR.conf.transit) {
            map.addControl(new BR.Control({
                 heading: '',
                //  divId: 'header'
            }));
        }
        routingOptions.addTo(map);
        if (!BR.conf.transit) {
            stats.addTo(map);
        }
        // download.addTo(map);
        elevation.addTo(map);

        nogos.addTo(map);
        routing.addTo(map);
        map.addControl(new BR.OpacitySlider({
            callback: L.bind(routing.setOpacity, routing)
        }));

        // initial option settings (after controls are added and initialized with onAdd, before permalink)
        router.setOptions(nogos.getOptions());
        router.setOptions(routingOptions.getOptions());
        profile.update(routingOptions.getOptions());

        permalink = new L.Control.Permalink({
            text: 'Permalink',
            position: 'bottomright',
            layers: layersControl,
            routingOptions: routingOptions,
            nogos: nogos,
            router: router,
            routing: routing,
            profile: profile
        }).addTo(map);

        L.control.scale().addTo(map);
    }


    $('#search').on('input', function() {
        (this.value.length > 0) ? $('#whereami').hide() : $('#whereami').show();
    });

    initMap();
    initApp();

})();
