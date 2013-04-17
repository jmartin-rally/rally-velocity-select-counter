Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    defaults: { padding: 5 },
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'average_box'},
        {xtype:'container',itemId:'chart_box'}
    ],
    launch: function() {
        this._addSelectors();
        this._getIterations();
    },
    number_of_iterations: 5,
    _addSelectors: function() {
        this.down('#selector_box').add({
            xtype: 'rallynumberfield',
            value: 5,
            fieldLabel: 'Number of Sprints',
            validator: function(value) {
                if ( value < 1 ) {
                    return "Number of Iterations cannot be less than 1";
                }
                return true;
            },
            listeners: {
                change: function(field,new_value) {
                    if ( this.chart ){ this.chart.destroy(); }
                    this.number_of_iterations = new_value;
                    this._getIterations();
                },
                scope: this
            }
        });
    },
    _getIterations: function() {
        window.console && console.log("_getIterations",this.number_of_iterations);
        var me = this;
        this.down('#average_box').removeAll(true);
        
        this.sprint_hash = {};
        if ( this.number_of_iterations > 0 ) {
            Ext.create('Rally.data.WsapiDataStore',{
                model: 'Iteration',
                limit: this.number_of_iterations,
                pageSize: this.number_of_iterations,
                autoLoad: true,
                fetch:['Name'],
                context: {projectScopeUp:false,projectScopeDown:false},
                filters: [{property:'EndDate',operator:'<',value:Rally.util.DateTime.toIsoString(new Date())}],
                sorters: [{property:'EndDate', direction: 'DESC'}],
                listeners: {
                    load: function(store,data,success){
                        Ext.Array.each( data, function(item){
                            me.sprint_hash[item.get('Name')] = null;
                        }, this, true);
                        for (var name in me.sprint_hash) {
                            if ( me.sprint_hash.hasOwnProperty(name) ) {
                                this._getStoriesForSprint(name);
                            }
                        }
                    },
                    scope: this
                }
            });
        }
    },
    _getStoriesForSprint:function(name){
        window.console && console.log('_getStoriesForSprint',name);
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'UserStory',
            autoLoad: true,
            fetch:['PlanEstimate','ScheduleState'],
            filters:[{property:'Iteration.Name',operator:'=',value:name},{property:'PlanEstimate',operator:'>',value:0}],
            listeners: {
                load:function(store,data,success){
                    this._getDefectsForSprint(name,data);
                },
                scope: this
            }
        });
    },
    _getDefectsForSprint: function(name,story_data){
        window.console && console.log('_getDefectsForSprint',name);
        if ( this.sprint_hash.hasOwnProperty(name) ) {
            this.sprint_hash[name] = [];
            Ext.create('Rally.data.WsapiDataStore',{
                model: 'Defect',
                autoLoad: true,
                fetch:['PlanEstimate','ScheduleState'],
                filters:[{property:'Iteration.Name',operator:'=',value:name},{property:'PlanEstimate',operator:'>',value:0}],
                listeners: {
                    load:function(store,defect_data,success){
                        this.sprint_hash[name] = Ext.Array.merge(defect_data,story_data);
                        this._calculateVelocities();
                    },
                    scope: this
                }
            });
        }
    },
    _calculateVelocities: function() {
        // make sure we have all the sprints
        var go_on = true;
        for ( var name in this.sprint_hash ) {
            if ( this.sprint_hash.hasOwnProperty(name) ) {
                if (this.sprint_hash[name] === null ) {
                    go_on = false;
                    window.console && console.log( "Waiting on ", name);
                    break;
                }
            }
        }
        if ( go_on ) {
            window.console && console.log( "Calculate");
            
            var sprints = [];
            for ( var name in this.sprint_hash ) {
                if ( this.sprint_hash.hasOwnProperty(name) ) {
                    var sprint_data = {
                        Name: name,
                        PlanEstimate: 0,
                        AcceptedEstimate: 0
                    }
                    Ext.Array.each(this.sprint_hash[name],function(item){
                        sprint_data.PlanEstimate += item.get('PlanEstimate');
                        if ( item.get('ScheduleState') === "Accepted" ) {
                            sprint_data.AcceptedEstimate += item.get('PlanEstimate');
                        }
                    });
                }
                sprints.push(sprint_data);
            }
            window.console && console.log( sprints );
            this._showAverages(sprints);
            this._showChart(sprints);
        }
    },
    _showAverages: function(sprints) {
        window.console && console.log("_showAverages",sprints);
        
        var box = this.down('#average_box');
        box.removeAll(true);
        var number_shown = sprints.length;
        var velocity_array = [];
        var velocity_total = 0;
        Ext.Array.each(sprints,function(sprint){
            if ( sprint.AcceptedEstimate > 0 ) {
                velocity_total += sprint.AcceptedEstimate;
                velocity_array.push(sprint.AcceptedEstimate);
            }
        });
        velocity_array = velocity_array.sort();
        console.log(velocity_array);
        
        if (velocity_total > 0 ) {
            var average = this._formatFewerDecimals(velocity_total / velocity_array.length);
            var low_index = 2;
            var high_index = velocity_array.length - 3;
            if ( velocity_array.length < 3 ) { 
                low_index = velocity_array.length - 1; 
                high_index = 0;
            }
            
            var highs = Ext.Array.slice(velocity_array,high_index);
            var high_average = this._formatFewerDecimals ( Ext.Array.sum( highs ) / highs.length );
            var lows = Ext.Array.slice(velocity_array,0,3);
            var low_average = this._formatFewerDecimals(Ext.Array.sum(lows)/lows.length);
            
            box.add({xtype:'container',html:'Average accepted for shown iterations:  ' + average});
            box.add({xtype:'container',html:'Average accepted for best ' + highs.length + ' iterations:  ' + high_average});
            box.add({xtype:'container',html:'Average accepted for worst ' + lows.length + ' iterations:  ' + low_average});
        }
    },

    _formatFewerDecimals: function( number_of_places ) {
        return parseInt(number_of_places*100) / 100;
    },
    _showChart: function(sprints) {
        window.console && console.log("_makeChart");
        var store = Ext.create('Rally.data.custom.Store',{
            data: sprints,
            autoLoad: true
        });
        if ( this.chart ) { this.chart.destroy(); }
        this.chart = Ext.create('Rally.ui.chart.Chart',{
            store: store,
            height: 400,
            series: [{type:'column',dataIndex:'AcceptedEstimate',name:'Velocity',visible: true}],
            chartConfig: {
                title: {text: "Velocity", align:"center"},
                colors: [ '#3c6' ],
                xAxis: [{ categories: this._getIterationNames(sprints) }],
                yAxis: [{
                    title: { text:"" }
                }]
            }
        });
        this.down('#chart_box').add(this.chart);
    },
    _getIterationNames: function(sprints) {
        var string_array = [];
        Ext.Array.each( sprints, function(item){
            string_array.push(item.Name);
        });
        return string_array;
    }
});
