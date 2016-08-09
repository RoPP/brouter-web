BR.Elevation = L.Class.extend({
    initialize: function() {
        this._data = [];
        this._dist = 0;
        this._maxElevation = 0;

        this._margin = [50, 10, 10, 25];
        this._width = parseInt($('#elevation-chart').width() - this._margin[0] - this._margin[2]);
        this._height = parseInt($('#elevation-chart').height() - this._margin[1] - this._margin[3]);

        this._svg = d3.select('#elevation-chart').append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .append('g')
            .attr('transform', 'translate(' + this._margin[0] + ',' + this._margin[1] + ')');

        var xscale = this._xscale = d3.scale.linear()
            .range([0, this._width])
            .nice();
        var yscale = this._yscale = d3.scale.linear()
            .range([this._height, 0])
            .nice();
        this._xaxis = d3.svg.axis()
            .scale(this._xscale)
            .ticks(0)
            .orient('bottom');
        this._yaxis = d3.svg.axis()
            .scale(this._yscale)
            .ticks(0)
            .orient('left');
        this._svg.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0, '+ this._height +')')
            .call(this._xaxis);
        this._svg.append('g')
            .attr('class', 'y axis')
            .call(this._yaxis);
        this._area = d3.svg.area()
            .x(function(d) { return xscale(d.dist); })
            .y0(this._height)
            .y1(function(d) { return yscale(d.altitude); });
        this._svg.append('path')
            .datum(this._data)
            .attr('class', 'area')
            .attr('d', this._area);

    },

    update: function(track, layer) {
        if (track && track.getLatLngs().length > 0) {
            this.addData(track.toGeoJSON());
            this._updateAxis();
            this._updateArea();
        }
    },

    addData: function(d) {
        if (!d && !d.geometry) {
            throw new Error('Invalid GeoJSON object.');
        }
        var data = [];
        var dist = 0;
        var ele = 0;
        var coords = d.geometry.coordinates;
        for (var i = 0; i < coords.length; i++) {
            var s = new L.LatLng(coords[i][1], coords[i][0]);
            var e = new L.LatLng(coords[i ? i - 1 : 0][1], coords[i ? i - 1 : 0][0]);
            var newdist = s.distanceTo(e);
            dist = dist + Math.round(newdist / 1000 * 100000) / 100000;
            ele = Math.max(coords[i][2], ele);
            data.push({
                dist: dist,
                altitude: coords[i][2],
                x: coords[i][0],
                y: coords[i][1],
                latlng: s
            });
        }
        this._data = data;
        this._dist = dist;
        this._maxElevation = ele;
    },

    _updateAxis: function() {
        this._xscale.range([0, this._width])
            .nice();
        this._yscale.range([this._height, 0])
            .nice();

        this._xscale.domain(d3.extent(this._data, function(d) {
            return d.dist;
        }));
        this._yscale.domain(d3.extent(this._data, function(d) {
            return d.altitude;
        }));
        this._xaxis
            .ticks(Math.max(this._width/100, 0))
            .tickFormat(function (d) { return d + ' km' });
        this._yaxis
            .ticks(Math.max(this._height/25, 0))
            .tickFormat(function (d) { return d + ' m' });

        this._svg.select('.x.axis')
            .attr('transform', 'translate(0, '+ this._height +')')
            .call(this._xaxis);
        this._svg.select('.y.axis')
            .call(this._yaxis);
    },

    _updateArea: function() {
        this._svg.selectAll('.area')
            .datum(this._data)
            .attr('d', this._area);
    },

    resize: function() {
        this._width = parseInt($('#elevation-chart').width() - this._margin[0] - this._margin[2]);
        this._height = parseInt($('#elevation-chart').height() - this._margin[1] - this._margin[3]);
        this._updateAxis();
        this._updateArea();
    }
});

BR.elevation = function() {
    return new BR.Elevation();
};
