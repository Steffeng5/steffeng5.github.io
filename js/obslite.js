import('./obshelper.js');


    const WARN_DISTANCE= 200
    const MIN_DISTANCE= 150

function handleFiles(files) {
    // Check for the various File API support.
    if (window.FileReader) {
        // FileReader are supported.
        process(files[0]);
    } else {
        alert('FileReader are not supported in this browser.');
    }
}

function process(fileToRead) {
    const reader = new FileReader();
    // Read file into memory as UTF-8
    reader.readAsText(fileToRead);
    // Handle errors load
    reader.onload = loadHandler;
    reader.onerror = errorHandler;
}

function createMap(pointArray) {
    const tileLayer = new ol.layer.Tile({
        source: new ol.source.OSM()
    });


    const trackPointsLeft = [];
    const trackPointsRight = [];
    const trackPointsUntaggedLeft = [];
    const trackPointsUntaggedRight = [];
    const points = [];

        for (let i = 0; i < pointArray.length; i++) {
            let dataPoint = pointArray[i];
            if (dataPoint.latitude && dataPoint.longitude) {
                const p = ol.proj.fromLonLat([dataPoint.longitude, dataPoint.latitude]);
                points.push(p);


                if (dataPoint.confirmed > 0) {
                        trackPointsLeft.push(
                            new ol.Feature({
                                distance: dataPoint.left ? dataPoint.left : 999,
                                geometry: new ol.geom.Point(p)
                            })
                        )
                    

                        trackPointsRight.push(
                            new ol.Feature({
                                distance: dataPoint.right ? dataPoint.right : 999,
                                geometry: new ol.geom.Point(p)
                            })
                        );
                   
                } else {
                        trackPointsUntaggedLeft.push(
                            new ol.Feature({
                                distance: dataPoint.left ? dataPoint.left : 999,
                                geometry: new ol.geom.Point(p)
                            })
                        )
                   
                        trackPointsUntaggedRight.push(
                            new ol.Feature({
                                distance: dataPoint.right ? dataPoint.right : 999,
                                geometry: new ol.geom.Point(p)
                            })
                        );
                 
                }
            }
        }

    //Simplify to 1 point per 2 meter
    const trackVectorSource = new ol.source.Vector({
        features: [
            new ol.Feature(new ol.geom.LineString(points).simplify(2))
        ]
    });

    const trackLayer =
        new ol.layer.Vector({
            visible: true,
            updateWhileAnimating: false,
            updateWhileInteracting: false,

            source: trackVectorSource,
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({
                    width: 3,
                    color: 'rgb(30,144,255)'
                })
            })

        });

    const olMap = new ol.Map({
        layers: [
            tileLayer,
            trackLayer,
            new ol.layer.Group({
                title: 'Tagged Points',
                layers: [
                    getPointLayer(trackPointsLeft, "Left", true),
                    getPointLayer(trackPointsRight, "Right", false),

                ]
            }),
            new ol.layer.Group({
                title: 'Untagged Points',
                fold: 'close',
                visible: false,
                layers: [
                    getPointLayer(trackPointsUntaggedLeft, "Left Untagged", false),
                    getPointLayer(trackPointsUntaggedRight, "Right Untagged", false),

                ]
            })
        ],
        target: 'map',
        view: new ol.View({
            maxZoom: 22,
            center: points[0] || ol.proj.fromLonLat([9.1797, 48.7784]),
            zoom: 15
        })
    });

    function getPointLayer(trackPoints, title, visible) {
        return new ol.layer.Vector(
            {
                title: title,
                visible: visible,
                style: pointStyleFunction,
                source: new ol.source.Vector({
                    features: trackPoints
                }),

            });
    }

    const layerSwitcher = new LayerSwitcher({
        groupSelectStyle: 'children',
        startActive: true,
        activationMode: 'click',
        reverse: false,


    });
    olMap.addControl(layerSwitcher);


    function pointStyleFunction(feature, resolution) {
        let distance = feature.get("distance");
        let radius = 200 / resolution;

        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: radius < 20 ? radius : 20,
                fill: evaluateDistanceForFillColor(distance),
                stroke: evaluateDistanceForStrokeColor(distance)
            }),
            text: createTextStyle(distance, resolution),
        });
    }


    const evaluateDistanceForFillColor = function (distance) {
        const redFill = new ol.style.Fill({color: 'rgba(255, 0, 0, 0.2)'})
        const orangeFill = new ol.style.Fill({color: 'rgba(245,134,0,0.2)'})
        const greenFill = new ol.style.Fill({color: 'rgba(50, 205, 50, 0.2)'})

        switch (evaluateDistanceColor(distance)) {
            case 'red':
                return redFill
            case 'orange':
                return orangeFill
            case 'green':
                return greenFill
        }
    }

    const evaluateDistanceForStrokeColor = function (distance) {
        const redStroke = new ol.style.Stroke({color: 'rgb(255, 0, 0)'})
        const orangeStroke = new ol.style.Stroke({color: 'rgb(245,134,0)'})
        const greenStroke = new ol.style.Stroke({color: 'rgb(50, 205, 50)'})

        switch (evaluateDistanceColor(distance)) {
            case 'red':
                return redStroke
            case 'orange':
                return orangeStroke
            case 'green':
                return greenStroke
        }
    }

    const evaluateDistanceColor = function (distance) {
        if (distance < MIN_DISTANCE) {
            return 'red'
        } else if (distance < WARN_DISTANCE) {
            return 'orange'
        } else {
            return 'green'
        }
    }

    const createTextStyle = function (distance, resolution) {
        return new ol.style.Text({
            textAlign: 'center',
            textBaseline: 'middle',
            font: 'normal 18px/1 Arial',
            text: resolution < 6 ? "" + distance : "",
            fill: new ol.style.Fill({color: evaluateDistanceColor(distance)}),
            stroke: new ol.style.Stroke({color: 'white', width: 2}),
            offsetX: 0,
            offsetY: 0
        });
    };


    olMap.getView().fit(trackVectorSource.getExtent());
}

function loadHandler(event) {
    const csv = event.target.result;
    const pointArray = getProcessedData(csv);

    createMap(pointArray)


}

function getProcessedData(csv) {
    const body = replaceDollarNewlinesHack(csv);

    const detectedFormat = detectFormat(body);

    if (detectedFormat !== 2 && detectedFormat !== 1) {
        console.error('track format cannot be detected or not implemented yet')
        throw new Error('track format cannot be detected or not implemented yet')
    }

    const pointArray = [];
    let dateCol = undefined;
    let timeCol = undefined;
    let confirmedCol = undefined;
    let latCol = undefined;
    let longCol = undefined;
    let leftCol = undefined;
    let rightCol = undefined;


    let i = hasMetaDataLine(body) ? 1 : 0;

    const allTextLines = csv.split(/\r\n|\n/);
    for (i; i < allTextLines.length; i++) {
        const data = allTextLines[i].split(';');

        //Analyze Headers
        if (i <= 1 && !latCol) {
            for (let j = 0; j < data.length; j++) {
                switch (data[j]) {
                    case 'Date':
                        dateCol = j;
                        break;
                    case 'Time':
                        timeCol = j;
                        break;
                    case 'Latitude':
                        latCol = j;
                        break;
                    case 'Longitude':
                        longCol = j;
                        break;
                    case 'Confirmed':
                        confirmedCol = j;
                        break;
                    case 'Left':
                        leftCol= j;
                        break;
                    case 'Right':
                        rightCol = j;
                        break;
                }
            }
        } else {
            if (undefined != data[latCol] && undefined != data[longCol]) {
                const trackPoint = {};
                trackPoint.longitude = data[longCol]
                trackPoint.latitude = data[latCol]
                trackPoint.date = data[dateCol]
                trackPoint.time = data[timeCol]
                trackPoint.confirmed = data[confirmedCol]
                trackPoint.left = data[leftCol]
                trackPoint.right = data[rightCol]

                pointArray.push(trackPoint)
            }

        }
    }
    return pointArray
}

function errorHandler(evt) {
    if (evt.target.error.name == "NotReadableError") {
        alert("Cannot read file!");
    }
}

//
function hasMetaDataLine(body) {
    const firstLinebreakIndex = body.indexOf('\n');

    const firstLine = body.substring(0, firstLinebreakIndex);

    const match = firstLine.match(/(^|&)OBSDataFormat=([\d]+)($|&)/);
    console.log(match)
    return (match != null)
}
