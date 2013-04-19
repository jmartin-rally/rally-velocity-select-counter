Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    defaults: { padding: 5 },
    allRelease: "--ANY--",
    items: [
        {xtype:'container',itemId:'selector_box', layout: { type: 'hbox' }},
        {xtype:'container',itemId:'average_box'},
        {xtype:'container',itemId:'chart_box'}
    ],
    launch: function() {
        this._addSelectors();
    },
    number_of_iterations: 5,
    _addSelectors: function() {
        var me = this;
        var first_time = true;
        this.down('#selector_box').add({
            xtype:'rallyreleasecombobox',
            itemId:'release_box',
            width: 300,
            fieldLabel: "Release Window:",
            listeners: {
                change: function(rb,newValue,oldValue) {
                    this._updateIterationBoxes(rb.getRecord());
                },
                ready: function(rb) {
                    this._updateIterationBoxes(rb.getRecord());
                },
                scope: this
            },
            storeConfig: {
                listeners: {
                    load: function(store) {
                        if ( first_time ) {
                            store.loadData([{formattedName: me.allRelease,
                                            formattedStartDate: 'n/a',
                                            formattedEndDate: 'n/a',
                                            Name: me.allRelease,
                                            isSelected: false}],
                                            true);
                            store.sort('formattedStartDate', 'DESC');
                            first_time = false;
                        }
                     }
                }
            }
        });
    },
    _updateIterationBoxes: function(release) {
        window.console && console.log("_updateIterationBoxes",release);
        var me = this;
        if ( this.chart ) { this.chart.destroy(); }
        this.down('#average_box').removeAll(true);
        if ( this.start_box ) { this.start_box.destroy(); }
        if ( this.end_box ) { this.end_box.destroy(); }
        if ( this.down('#calculate_button') ) { this.down('#calculate_button').destroy(); }
        
        var today = Rally.util.DateTime.toIsoString(new Date());
        var release_filter = [{property:'EndDate',operator:'<',value:today}];

        if (release.get('Name') !== this.allRelease ) {
            release_filter = [
                {property:'EndDate',operator:'>=',value:Rally.util.DateTime.toIsoString(release.get('ReleaseStartDate'))},
                {property:'StartDate',operator:'<=',value:Rally.util.DateTime.toIsoString(release.get('ReleaseDate'))}
            ];
        }

        this.start_box = Ext.create('Rally.ui.combobox.IterationComboBox',{
            width: 300,
            itemId:'start_iteration_box',
            fieldLabel: 'Start Iteration:',
            storeConfig: {
                filters: release_filter
            },
            listeners: {
                ready: function(ib) {
                    if (ib.getStore().getAt(0)) {
                        ib.setValue(ib.getStore().getAt(ib.getStore().getCount()-1).get('_ref'));
                    }
                    me.end_box = Ext.create('Rally.ui.combobox.IterationComboBox',{
                        width: 300,
                        itemId:'end_iteration_box',
                        fieldLabel: 'End Iteration:',
                        storeConfig: {
                            filters: release_filter
                        },
                        listeners: {
                            ready: function(ib) {
                                if (ib.getStore().getAt(0)) {
                                    ib.setValue(ib.getStore().getAt(0).get('_ref'));
                                }
                                
                                me._setButton();
                            },
                            change: function(ib){
                                me.down('#average_box').removeAll(true);
                                if ( me.chart ) { me.chart.destroy(); }
                                me._setButton();
                            }
                        }
                    });
                    me.down('#selector_box').add(me.end_box);
                    me.down('#selector_box').add({
                        itemId:'calculate_button',
                        xtype:'rallybutton',
                        text:'Display Velocities',
                        disabled:true,
                        handler: function() {
                            me._getIterations(release);
                        }
                    });
                },
                change: function(ib){
                    me.down('#average_box').removeAll(true);
                    if ( me.chart ) { me.chart.destroy(); }
                    me._setButton();
                }
            }
        });
        this.down('#selector_box').add(this.start_box);
    },
    _setButton: function() {
        window.console && console.log("_setButton");
        if ( this.down('#calculate_button') ) {
            this.down('#calculate_button').setDisabled(true);
            if ( this.end_box && this.start_box ) {
                var start_sprint = this.start_box.getRecord();
                var end_sprint = this.end_box.getRecord();
                if ( start_sprint && end_sprint ) {
                    if ( start_sprint.get('StartDate') <= end_sprint.get('StartDate') ) {
                        this.down('#calculate_button').setDisabled(false);
                    }
                }
            }
        }
    },
    _getIterations: function(release) {
        window.console && console.log("_getIterations",release);
        var me = this;
        var today = Rally.util.DateTime.toIsoString(new Date());
        
        var start_date = Rally.util.DateTime.toIsoString(this.start_box.getRecord().get('StartDate'));
        var end_date = Rally.util.DateTime.toIsoString(this.end_box.getRecord().get('EndDate'));
        
        if ( start_date < today ) {
            if ( today < end_date ) {
                end_date = today;
            }
        }
        
        var filters = [
            {property:'EndDate',operator:'>',value:start_date},
            {property:'StartDate',operator:'<',value:end_date}
        ];
        this.sprint_hash = {};
        Ext.create('Rally.data.WsapiDataStore',{
            model: 'Iteration',
            /*limit: this.number_of_iterations,*/
            autoLoad: true,
            fetch:['Name'],
            context: {projectScopeUp:false,projectScopeDown:false},
            filters: filters,
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
