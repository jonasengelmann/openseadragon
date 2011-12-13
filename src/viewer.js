
(function( $ ){
/**
 *  OpenSeadragon Viewer
 *
 *  The main point of entry into creating a zoomable image on the page.
 *
 *  We have provided an idiomatic javascript constructor which takes
 *  a single object, but still support the legacy positional arguments.
 *
 *  The options below are given in order that they appeared in the constructor
 *  as arguments and we translate a positional call into an idiomatic call.
 *
 *  options:{
 *      element:    String id of Element to attach to,
 *      xmlPath:    String xpath ( TODO: not sure! ),
 *      prefixUrl:  String url used to prepend to paths, eg button images,
 *      controls:   Array of Seadragon.Controls,
 *      overlays:   Array of Seadragon.Overlays,
 *      overlayControls: An Array of ( TODO: not sure! )
 *  }
 *
 *
 **/    
$.Viewer = function( options ) {

    var args = arguments,
        _this = this,
        i;

    if( typeof( options ) != 'object' ){
        options = {
            id:                 args[ 0 ],
            xmlPath:            args.length > 1 ? args[ 1 ] : undefined,
            prefixUrl:          args.length > 2 ? args[ 2 ] : undefined,
            controls:           args.length > 3 ? args[ 3 ] : undefined,
            overlays:           args.length > 4 ? args[ 4 ] : undefined,
            overlayControls:    args.length > 5 ? args[ 5 ] : undefined,
            config:             {}
        };
    }
    
    //Allow the options object to override global defaults
    $.extend( true, this, { 
        id:                 options.id,
        xmlPath:            null,
        prefixUrl:          '',
        controls:           [],
        overlays:           [],
        overlayControls:    [],
        config: {
            debugMode:          true,
            animationTime:      1.5,
            blendTime:          0.5,
            alwaysBlend:        false,
            autoHideControls:   true,
            immediateRender:    false,
            wrapHorizontal:     false,
            wrapVertical:       false,
            minZoomImageRatio:  0.8,
            maxZoomPixelRatio:  2,
            visibilityRatio:    0.5,
            springStiffness:    5.0,
            imageLoaderLimit:   2,
            clickTimeThreshold: 200,
            clickDistThreshold: 5,
            zoomPerClick:       2.0,
            zoomPerScroll:      1.2,
            zoomPerSecond:      2.0,
            showNavigationControl: true,
            maxImageCacheCount: 100,
            minPixelRatio:      0.5,
            mouseNavEnabled:    true,
            navImages: {
                zoomIn: {
                    REST:   '/images/zoomin_rest.png',
                    GROUP:  '/images/zoomin_grouphover.png',
                    HOVER:  '/images/zoomin_hover.png',
                    DOWN:   '/images/zoomin_pressed.png'
                },
                zoomOut: {
                    REST:   '/images/zoomout_rest.png',
                    GROUP:  '/images/zoomout_grouphover.png',
                    HOVER:  '/images/zoomout_hover.png',
                    DOWN:   '/images/zoomout_pressed.png'
                },
                home: {
                    REST:   '/images/home_rest.png',
                    GROUP:  '/images/home_grouphover.png',
                    HOVER:  '/images/home_hover.png',
                    DOWN:   '/images/home_pressed.png'
                },
                fullpage: {
                    REST:   '/images/fullpage_rest.png',
                    GROUP:  '/images/fullpage_grouphover.png',
                    HOVER:  '/images/fullpage_hover.png',
                    DOWN:   '/images/fullpage_pressed.png'
                }
            }
        },

        //These were referenced but never defined
        controlsFadeDelay:  2000,
        controlsFadeLength: 1500,

        //These are originally not part options but declared as members
        //in initialize.  Its still considered idiomatic to put them here
        source:     null,
        drawer:     null,
        viewport:   null,
        profiler:   null,

        //This was originally initialized in the constructor and so could never
        //have anything in it.  now it can because we allow it to be specified
        //in the options and is only empty by default if not specified. Also
        //this array was returned from get_controls which I find confusing
        //since this object has a controls property which is treated in other
        //functions like clearControls.  I'm removing the accessors.
        customControls: []

    }, options );

    this.element        = document.getElementById( options.id );
    this.container      = $.Utils.makeNeutralElement("div");
    this.canvas         = $.Utils.makeNeutralElement("div");
    this.events         = new $.EventHandlerList();

    this._fsBoundsDelta = new $.Point(1, 1);
    this._prevContainerSize = null;
    this._lastOpenStartTime = 0;
    this._lastOpenEndTime   = 0;
    this._animating         = false;
    this._forceRedraw       = false;
    this._mouseInside       = false;

    this.innerTracker = new $.MouseTracker(
        this.canvas, 
        this.config.clickTimeThreshold, 
        this.config.clickDistThreshold
    );
    this.innerTracker.clickHandler   = $.delegate(this, onCanvasClick);
    this.innerTracker.dragHandler    = $.delegate(this, onCanvasDrag);
    this.innerTracker.releaseHandler = $.delegate(this, onCanvasRelease);
    this.innerTracker.scrollHandler  = $.delegate(this, onCanvasScroll);
    this.innerTracker.setTracking( true ); // default state

    this.outerTracker = new $.MouseTracker(
        this.container, 
        this.config.clickTimeThreshold, 
        this.config.clickDistThreshold
    );
    this.outerTracker.enterHandler   = $.delegate(this, onContainerEnter);
    this.outerTracker.exitHandler    = $.delegate(this, onContainerExit);
    this.outerTracker.releaseHandler = $.delegate(this, onContainerRelease);
    this.outerTracker.setTracking( true ); // always tracking

    (function( canvas ){
        canvas.width    = "100%";
        canvas.height   = "100%";
        canvas.overflow = "hidden";
        canvas.position = "absolute";
        canvas.top      = "0px";
        canvas.left     = "0px";
    }(  this.canvas.style ));


    (function( container ){
        container.width     = "100%";
        container.height    = "100%";
        container.position  = "relative";
        container.left      = "0px";
        container.top       = "0px";
        container.textAlign = "left";  // needed to protect against
    }( this.container.style ));

    var layouts = [ 'topleft', 'topright', 'bottomright', 'bottomleft'],
        layout;

    for( i = 0; i < layouts.length; i++ ){
        layout = layouts[ i ]
        this.controls[ layout ] = $.Utils.makeNeutralElement("div");
        this.controls[ layout ].style.position = 'absolute';
        if ( layout.match( 'left' ) ){
            this.controls[ layout ].style.left = '0px';
        }
        if ( layout.match( 'right' ) ){
            this.controls[ layout ].style.right = '0px';
        }
        if ( layout.match( 'top' ) ){
            this.controls[ layout ].style.top = '0px';
        }
        if ( layout.match( 'bottom' ) ){
            this.controls[ layout ].style.bottom = '0px';
        }
    }

    if ( this.config.showNavigationControl ) {
        navControl = (new $.NavControl(this)).elmt;
        navControl.style.marginRight = "4px";
        navControl.style.marginBottom = "4px";
        this.addControl(navControl, $.ControlAnchor.BOTTOM_RIGHT);
    }

    for ( i = 0; i < this.customControls.length; i++ ) {
        this.addControl(
            this.customControls[ i ].id, 
            this.customControls[ i ].anchor
        );
    }

    this.container.appendChild( this.canvas );
    this.container.appendChild( this.controls.topleft );
    this.container.appendChild( this.controls.topright );
    this.container.appendChild( this.controls.bottomright );
    this.container.appendChild( this.controls.bottomleft );
    this.element.appendChild( this.container );

    window.setTimeout( function(){
        beginControlsAutoHide( _this );
    }, 1 );    // initial fade out

    if (this.xmlPath){
        this.openDzi( this.xmlPath );
    }
};

$.Viewer.prototype = {
    
    _updateMulti: function () {
        if (!this.source) {
            return;
        }

        var beginTime = new Date().getTime();

        this._updateOnce();
        scheduleUpdate( this, arguments.callee, beginTime );
    },
    _updateOnce: function () {
        if ( !this.source ) {
            return;
        }

        this.profiler.beginUpdate();

        var containerSize = $.Utils.getElementSize( this.container );

        if (!containerSize.equals(this._prevContainerSize)) {
            this.viewport.resize(containerSize, true); // maintain image position
            this._prevContainerSize = containerSize;
            raiseEvent( this, "resize" );
        }

        var animated = this.viewport.update();

        if (!this._animating && animated) {
            raiseEvent( this, "animationstart" );
            abortControlsAutoHide( this );
        }

        if (animated) {
            this.drawer.update();
            raiseEvent( this, "animation" );
        } else if (this._forceRedraw || this.drawer.needsUpdate()) {
            this.drawer.update();
            this._forceRedraw = false;
        } else {
            this.drawer.idle();
        }

        if (this._animating && !animated) {
            raiseEvent( this, "animationfinish" );

            if (!this._mouseInside) {
                beginControlsAutoHide( this );
            }
        }

        this._animating = animated;

        this.profiler.endUpdate();
    },

    getNavControl: function () {
        return this._navControl;
    },
    add_open: function (handler) {
        this.events.addHandler("open", handler);
    },
    remove_open: function (handler) {
        this.events.removeHandler("open", handler);
    },
    add_error: function (handler) {
        this.events.addHandler("error", handler);
    },
    remove_error: function (handler) {
        this.events.removeHandler("error", handler);
    },
    add_ignore: function (handler) {
        this.events.addHandler("ignore", handler);
    },
    remove_ignore: function (handler) {
        this.events.removeHandler("ignore", handler);
    },
    add_resize: function (handler) {
        this.events.addHandler("resize", handler);
    },
    remove_resize: function (handler) {
        this.events.removeHandler("resize", handler);
    },
    add_animationstart: function (handler) {
        this.events.addHandler("animationstart", handler);
    },
    remove_animationstart: function (handler) {
        this.events.removeHandler("animationstart", handler);
    },
    add_animation: function (handler) {
        this.events.addHandler("animation", handler);
    },
    remove_animation: function (handler) {
        this.events.removeHandler("animation", handler);
    },
    add_animationfinish: function (handler) {
        this.events.addHandler("animationfinish", handler);
    },
    remove_animationfinish: function (handler) {
        this.events.removeHandler("animationfinish", handler);
    },
    addControl: function ( elmt, anchor ) {
        var elmt = $.Utils.getElement( elmt ),
            div = null;

        if ( getControlIndex( this, elmt ) >= 0 ) {
            return;     // they're trying to add a duplicate control
        }

        switch ( anchor ) {
            case $.ControlAnchor.TOP_RIGHT:
                div = this.controls.topright;
                elmt.style.position = "relative";
                break;
            case $.ControlAnchor.BOTTOM_RIGHT:
                div = this.controls.bottomright;
                elmt.style.position = "relative";
                break;
            case $.ControlAnchor.BOTTOM_LEFT:
                div = this.controls.bottomleft;
                elmt.style.position = "relative";
                break;
            case $.ControlAnchor.TOP_LEFT:
                div = this.controls.topleft;
                elmt.style.position = "relative";
                break;
            case $.ControlAnchor.NONE:
            default:
                div = this.container;
                elmt.style.position = "absolute";
                break;
        }

        this.controls.push(
            new $.Control( elmt, anchor, div )
        );
        elmt.style.display = "inline-block";
    },
    isOpen: function () {
        return !!this.source;
    },
    openDzi: function (xmlUrl, xmlString) {
        var _this = this;
        $.DziTileSourceHelper.createFromXml(
            xmlUrl, 
            xmlString,
            function( source ){
               _this.open( source );
            }
        );
    },
    openTileSource: function ( tileSource ) {
        var _this = this;
        window.setTimeout( function () {
            _this.open( tileSource );
        }, 1);
    },
    open: function( source ) {
        var _this = this;

        if ( this.source ) {
            this.close();
        }

        this._lastOpenStartTime = new Date().getTime();   // to ignore earlier opens

        window.setTimeout( function () {
            if ( _this._lastOpenStartTime > _this._lastOpenEndTime ) {
                _this._setMessage( $.Strings.getString( "Messages.Loading" ) );
            }
        }, 2000);

        this._lastOpenEndTime = new Date().getTime();

        if ( this._lastOpenStartTime < viewer._lastOpenStartTime ) {
            $.Debug.log( "Ignoring out-of-date open." );
            raiseEvent( this, "ignore" );
            return;
        }

        this.canvas.innerHTML = "";
        this._prevContainerSize = $.Utils.getElementSize( this.container );

        if( source ){
            this.source = source;
        }
        this.viewport = new $.Viewport( 
            this._prevContainerSize, 
            this.source.dimensions, 
            this.config
        );
        this.drawer = new $.Drawer(
            this.source, 
            this.viewport, 
            this.canvas
        );
        this.profiler = new $.Profiler();

        this._animating = false;
        this._forceRedraw = true;
        scheduleUpdate( this, this._updateMulti );

        for ( var i = 0; i < this.overlayControls.length; i++ ) {
            var overlay = this.overlayControls[ i ];
            if (overlay.point != null) {
                this.drawer.addOverlay(
                    overlay.id, 
                    new $.Point( 
                        overlay.point.X, 
                        overlay.point.Y 
                    ), 
                    $.OverlayPlacement.TOP_LEFT
                );
            } else {
                this.drawer.addOverlay(
                    overlay.id, 
                    new $.Rect(
                        overlay.rect.Point.X, 
                        overlay.rect.Point.Y, 
                        overlay.rect.Width, 
                        overlay.rect.Height
                    ), 
                    overlay.placement
                );
            }
        }
        raiseEvent( this, "open" );
    },
    close: function () {
        
        this.source = null;
        this.viewport = null;
        this.drawer = null;
        this.profiler = null;

        this.canvas.innerHTML = "";
    },
    removeControl: function ( elmt ) {
        var elmt = $.Utils.getElement( elmt ),
            i    = getControlIndex( this, elmt );
        if ( i >= 0 ) {
            this.controls[ i ].destroy();
            this.controls.splice( i, 1 );
        }
    },
    clearControls: function () {
        while ( this.controls.length > 0 ) {
            this.controls.pop().destroy();
        }
    },
    isDashboardEnabled: function () {
        var i;
        for ( i = this.controls.length - 1; i >= 0; i-- ) {
            if (this.controls[ i ].isVisible()) {
                return true;
            }
        }

        return false;
    },

    isFullPage: function () {
        return this.container.parentNode == document.body;
    },

    isMouseNavEnabled: function () {
        return this.innerTracker.isTracking();
    },

    isVisible: function () {
        return this.container.style.visibility != "hidden";
    },

    setDashboardEnabled: function (enabled) {
        var i;
        for ( i = this.controls.length - 1; i >= 0; i-- ) {
            this.controls[ i ].setVisible( enabled );
        }
    },

    setFullPage: function( fullPage ) {
        if ( fullPage == this.isFullPage() ) {
            return;
        }

        var body        = document.body,
            bodyStyle   = body.style,
            docStyle    = document.documentElement.style,
            containerStyle = this.container.style,
            canvasStyle = this.canvas.style,
            oldBounds,
            newBounds;

        if ( fullPage ) {

            bodyOverflow        = bodyStyle.overflow;
            docOverflow         = docStyle.overflow;
            bodyStyle.overflow  = "hidden";
            docStyle.overflow   = "hidden";

            bodyWidth           = bodyStyle.width;
            bodyHeight          = bodyStyle.height;
            bodyStyle.width     = "100%";
            bodyStyle.height    = "100%";

            canvasStyle.backgroundColor = "black";
            canvasStyle.color           = "white";

            containerStyle.position = "fixed";
            containerStyle.zIndex   = "99999999";

            body.appendChild( this.container );
            this._prevContainerSize = $.Utils.getWindowSize();

            // mouse will be inside container now
            $.delegate( this, onContainerEnter )();    

        } else {

            bodyStyle.overflow  = bodyOverflow;
            docStyle.overflow   = docOverflow;

            bodyStyle.width     = bodyWidth;
            bodyStyle.height    = bodyHeight;

            canvasStyle.backgroundColor = "";
            canvasStyle.color           = "";

            containerStyle.position = "relative";
            containerStyle.zIndex   = "";

            this.element.appendChild( this.container );
            this._prevContainerSize = $.Utils.getElementSize( this.element );
            
            // mouse will likely be outside now
            $.delegate( this, onContainerExit )();      

        }

        if ( this.viewport ) {
            oldBounds = this.viewport.getBounds();
            this.viewport.resize(this._prevContainerSize);
            newBounds = this.viewport.getBounds();

            if ( fullPage ) {
                this._fsBoundsDelta = new $.Point(
                    newBounds.width  / oldBounds.width,
                    newBounds.height / oldBounds.height
                );
            } else {
                this.viewport.update();
                this.viewport.zoomBy(
                    Math.max( 
                        this._fsBoundsDelta.x, 
                        this._fsBoundsDelta.y 
                    ),
                    null, 
                    true
                );
            }

            this._forceRedraw = true;
            raiseEvent( this, "resize", this );
            this._updateOnce();
        }
    },

    setMouseNavEnabled: function( enabled ){
        this.innerTracker.setTracking( enabled );
    },

    setVisible: function( visible ){
        this.container.style.visibility = visible ? "" : "hidden";
    }

};

///////////////////////////////////////////////////////////////////////////////
// Schedulers provide the general engine for animation
///////////////////////////////////////////////////////////////////////////////

function scheduleUpdate( viewer, updateFunc, prevUpdateTime ){
    var currentTime,
        prevUpdateTime,
        targetTime,
        deltaTime;

    if (this._animating) {
        return window.setTimeout(
            $.delegate(viewer, updateFunc), 
            1
        );
    }

    currentTime     = +new Date();
    prevUpdateTime  = prevUpdateTime ? prevUpdateTime : currentTime;
    targetTime      = prevUpdateTime + 1000 / 60;    // 60 fps ideal
    deltaTime       = Math.max(1, targetTime - currentTime);
    
    return window.setTimeout($.delegate(viewer, updateFunc), deltaTime);
};

//provides a sequence in the fade animation
function scheduleControlsFade( viewer ) {
    window.setTimeout( function(){
        updateControlsFade( viewer );
    }, 20);
};

//initiates an animation to hide the controls
function beginControlsAutoHide( viewer ) {
    if ( !viewer.config.autoHideControls ) {
        return;
    }
    viewer.controlsShouldFade = true;
    viewer.controlsFadeBeginTime = 
        new Date().getTime() + 
        viewer.controlsFadeDelay;

    window.setTimeout( function(){
        scheduleControlsFade( viewer );
    }, viewer.controlsFadeDelay );
};


//determines if fade animation is done or continues the animation
function updateControlsFade( viewer ) {
    var currentTime,
        deltaTime,
        opacity,
        i;
    if ( viewer.controlsShouldFade ) {
        currentTime = new Date().getTime();
        deltaTime = currentTime - viewer.controlsFadeBeginTime;
        opacity = 1.0 - deltaTime / viewer.controlsFadeLength;

        opacity = Math.min( 1.0, opacity );
        opacity = Math.max( 0.0, opacity );

        for ( i = viewer.controls.length - 1; i >= 0; i--) {
            viewer.controls[ i ].setOpacity( opacity );
        }

        if ( opacity > 0 ) {
            // fade again
            scheduleControlsFade( viewer ); 
        }
    }
};

//stop the fade animation on the controls and show them
function abortControlsAutoHide( viewer ) {
    var i;
    viewer.controlsShouldFade = false;
    for ( i = viewer.controls.length - 1; i >= 0; i-- ) {
        viewer.controls[ i ].setOpacity( 1.0 );
    }
};

///////////////////////////////////////////////////////////////////////////////
// Event engine is simple, look up event handler and call.
///////////////////////////////////////////////////////////////////////////////
function raiseEvent( viewer, eventName, eventArgs) {
    var  handler = viewer.events.getHandler( eventName );
    if ( handler ) {
        if (!eventArgs) {
            eventArgs = new Object();
        }
        handler( viewer, eventArgs );
    }
};


///////////////////////////////////////////////////////////////////////////////
// Default view event handlers.
///////////////////////////////////////////////////////////////////////////////
function onCanvasClick(tracker, position, quick, shift) {
    var zoomPreClick,
        factor;
    if (this.viewport && quick) {    // ignore clicks where mouse moved         
        zoomPerClick = this.config.zoomPerClick;
        factor = shift ? 1.0 / zoomPerClick : zoomPerClick;
        this.viewport.zoomBy(factor, this.viewport.pointFromPixel(position, true));
        this.viewport.applyConstraints();
    }
};

function onCanvasDrag(tracker, position, delta, shift) {
    if (this.viewport) {
        this.viewport.panBy(this.viewport.deltaPointsFromPixels(delta.negate()));
    }
};

function onCanvasRelease(tracker, position, insideElmtPress, insideElmtRelease) {
    if (insideElmtPress && this.viewport) {
        this.viewport.applyConstraints();
    }
};

function onCanvasScroll(tracker, position, scroll, shift) {
    var factor;
    if (this.viewport) {
        factor = Math.pow(this.config.zoomPerScroll, scroll);
        this.viewport.zoomBy(factor, this.viewport.pointFromPixel(position, true));
        this.viewport.applyConstraints();
    }
};

function onContainerExit(tracker, position, buttonDownElmt, buttonDownAny) {
    if (!buttonDownElmt) {
        this._mouseInside = false;
        if (!this._animating) {
            beginControlsAutoHide( this );
        }
    }
};

function onContainerRelease(tracker, position, insideElmtPress, insideElmtRelease) {
    if (!insideElmtRelease) {
        this._mouseInside = false;
        if (!this._animating) {
            beginControlsAutoHide( this );
        }
    }
};

function onContainerEnter(tracker, position, buttonDownElmt, buttonDownAny) {
    this._mouseInside = true;
    abortControlsAutoHide( this );
};

///////////////////////////////////////////////////////////////////////////////
// Utility methods
///////////////////////////////////////////////////////////////////////////////
function getControlIndex( viewer, elmt ) {
    for ( i = viewer.controls.length - 1; i >= 0; i-- ) {
        if ( viewer.controls[ i ].elmt == elmt ) {
            return i;
        }
    }
    return -1;
};


///////////////////////////////////////////////////////////////////////////////
// Page update routines ( aka Views - for future reference )
///////////////////////////////////////////////////////////////////////////////




}( OpenSeadragon ));