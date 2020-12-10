"use strict";

/**
 * 
 * This script is from <>
 * By boholder, modification based on a related script.
 * 
 * It only works normally on the dedicated APP, "Scriptable", in the Apple Store,
 * here is this applicaiton's homepage: <https://scriptable.app/>
 * 
 * It is based on the Restful API interface update information provided by a nonprofit organization
 * that gathers global AQI sensor information. The API documents are as follows:
 * <https://aqicn.org/json-api/doc/>
 * You need to register a token for free with your email to call the API.
 * 
 * Below is the comment of the original script (2020-12-09):
 * 
 * This widget is from <https://github.com/jasonsnell/PurpleAir-AQI-Scriptable-Widget>
 * By Jason Snell, Rob Silverii, Adam Lickel, Alexander Ogilvie, and Brian Donovan.
 * Based on code by Matt Silverlock.
 */

// Aqicn json format query api url
const API_URL = "https://api.waqi.info/feed/"

// City name or city id, example: name: "london", london's city id: "@5724".
// Get city id from browsing <https://aqicn.org/city/city_name_lowercase>,
// goto "Download the real-time Air Quality Index Widget for:" column,
// click "iPhone & iPad" button, city id is in the popup's text.
const CITY = `cityNameOrCityId`

// You need to register a token for free with your email to call the API.
// <https://aqicn.org/data-platform/token/>
const TOKEN = "yourToken"

// If you are in a network environment where the API cannot be requested,
// set the request response waiting time (in seconds) from the Apple Widget 
// to end the request awaiting early.
var queryTimeOut = 60;
if (args.widgetParameter) {
  queryTimeOut = args.widgetParameter;
}

/**
 * Widget attributes: AQI level threshold, text label, gradient start and end colors, text color
 *
 * @typedef {object} LevelAttribute
 * @property {number} threshold
 * @property {string} label
 * @property {string} startColor
 * @property {string} endColor
 * @property {string} textColor
 * @property {string} darkStartColor
 * @property {string} darkEndColor
 * @property {string} darkTextColor
 */

/**
 * Get JSON from a local file
 *
 * @param {string} fileName
 * @returns {object}
 */
function getCachedData(fileName) {
  const fileManager = FileManager.local();
  const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "aqicn");
  const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

  if (!fileManager.fileExists(cacheFile)) {
    return undefined;
  }

  const contents = fileManager.readString(cacheFile);
  return JSON.parse(contents);
}

/**
 * Wite JSON to a local file
 *
 * @param {string} fileName
 * @param {object} data
 */
function cacheData(fileName, data) {
  const fileManager = FileManager.local();
  const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "aqicn");
  const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

  if (!fileManager.fileExists(cacheDirectory)) {
    fileManager.createDirectory(cacheDirectory);
  }

  const contents = JSON.stringify(data);
  fileManager.writeString(cacheFile, contents);
}

/**
 * Fetch content from AQICN
 *
 * @param {number} cityId
 * @returns {Promise<cityData>}
 */
async function getAqiData(city) {
  const cacheFileName = `${city}-data.json`;
  let json = await requestJsonWithTimeOut(`${API_URL}${city}/?token=${TOKEN}`);
  try {
    // Check that our results are what we expect
    const responseLooksGood = json && json.status === "ok";
    if (responseLooksGood) {
      console.log("INFO: Response data looks good, will cache.")
      cacheDataToFile();
    } else if (json) {
      console.log(`WARNING: Response shows error:`);
      console.log({ json });
      useCachedData();
    } else {
      // request timed out
      useCachedData();
    }

    let data = constructDataForWidget();
    console.log(`INFO: Data for widget constructed successed:`);
    console.log({ data });
    return data;

  } catch (error) {
    console.log(`ERROR: Could not parse JSON: ${error}`);
    throw 666;
  }

  // Note that Request() is API of Scriptable App,
  // <https://docs.scriptable.app/request/#timeoutinterval>
  // not <https://developer.mozilla.org/zh-CN/docs/Web/API/Request/Request>
  async function requestJsonWithTimeOut(url) {
    try {
      let request = new Request(url);
      request.timeoutInterval = queryTimeOut;
      let json = await request.loadJSON();
      return json;
    } catch (error) {
      console.log(`WARNING: Request timed out while timeout set to ${queryTimeOut} seconds, 
        return {} as response result.`);
      return {};
    };
  }
  function useCachedData() {
    const { json: cachedJson, updatedAt } = getCachedData(cacheFileName);
    let twoHours = 2 * 60 * 60 * 1000;
    let cacheDate = new Date(updatedAt);
    if (Date.now() - cacheDate > twoHours) {
      // Bail if our data is > 2 hours old
      throw `ERROR: Our cache is too old: ${cacheDate}`;
    }
    console.log(`INFO: Using cached data, cache time: ${cacheDate}`);
    json = cachedJson;
  }

  function cacheDataToFile() {
    const cityData = { json, updatedAt: Date.now() };
    cacheData(cacheFileName, cityData);
  }

  function constructDataForWidget() {
    const data = json.data;

    console.log("INFO: Using data collected by sensor at:");
    console.log(data.time.iso);
    return {
      aqi: data.aqi,
      city_name: data.city.name,
      geo_lat: data.city.geo[0],
      geo_lon: data.city.geo[1],
      time_stamp: data.time.iso,
    }
  }
}

/**
 * Fetch a renderable location
 *
 * @param {cityData} data
 * @returns {Promise<String>}
 */
async function getLocation(data) {
  try {
    if (data.city_name) {
      return data.city_name;
    }

    const geoData = await getGeoData(data.geo_lat, data.geo_lon);
    console.log({ geoData });

    if (geoData.neighborhood && geoData.city) {
      return `${geoData.neighborhood}, ${geoData.city}`;
    } else {
      return geoData.city || data.city_name;
    }
  } catch (error) {
    console.log(`WARNING: Could not cleanup location: ${error}`);
    return data.city_name;
  }
}

/**
 * Fetch reverse geocode
 *
 * @param {string} lat
 * @param {string} lon
 * @returns {Promise<GeospatialData>}
 */
async function getGeoData(lat, lon) {
  const latitude = Number.parseFloat(lat);
  const longitude = Number.parseFloat(lon);

  const geo = await Location.reverseGeocode(latitude, longitude);
  console.log({ geo: geo });

  return {
    neighborhood: geo[0].subLocality,
    city: geo[0].locality,
    state: geo[0].administrativeArea,
  };
}

/** 
 * @type {Array<LevelAttribute>} sorted by threshold desc. 
 */
const LEVEL_ATTRIBUTES = [
  {
    threshold: 300,
    label: "Hazardous",
    startColor: "76205d",
    endColor: "521541",
    textColor: "f0f0f0",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "ce4ec5",
  },
  {
    threshold: 200,
    label: "Very Unhealthy",
    startColor: "9c2424",
    endColor: "661414",
    textColor: "f0f0f0",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f33939",
  },
  {
    threshold: 150,
    label: "Unhealthy",
    startColor: "da5340",
    endColor: "bc2f26",
    textColor: "eaeaea",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f16745",
  },
  {
    threshold: 100,
    label: "Unhealthy for Sensitive Groups",
    startColor: "f5ba2a",
    endColor: "d3781c",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f7a021",
  },
  {
    threshold: 50,
    label: "Moderate",
    startColor: "f2e269",
    endColor: "dfb743",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f2e269",
  },
  {
    threshold: -20,
    label: "Good",
    startColor: "8fec74",
    endColor: "77c853",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "6de46d",
  },
];

/**
 * Calculates the AQI level
 * based on https://cfpub.epa.gov/airnow/index.cfm?action=aqibasics.aqi#unh
 *
 * @param {number|'-'} aqi
 * @returns {LevelAttribute & { level: number }}
 */
function calculateLevel(aqi) {
  const level = Number(aqi) || 0;

  const {
    label = "Weird",
    startColor = "white",
    endColor = "white",
    textColor = "black",
    darkStartColor = "009900",
    darkEndColor = "007700",
    darkTextColor = "000000",
    threshold = -Infinity,
  } = LEVEL_ATTRIBUTES.find(({ threshold }) => level > threshold) || {};

  return {
    label,
    startColor,
    endColor,
    textColor,
    darkStartColor,
    darkEndColor,
    darkTextColor,
    threshold,
    level,
  };
}

/**
 * Constructs an SFSymbol from the given symbolName
 * SFSymbol is Scriptable's API
 * @param {string} symbolName
 * @returns {object} SFSymbol
 */
function createSymbol(symbolName) {
  const symbol = SFSymbol.named(symbolName);
  symbol.applyFont(Font.systemFont(15));
  return symbol;
}

/**
 * main program
 */
async function run() {
  const listWidget = new ListWidget();
  listWidget.setPadding(10, 15, 10, 10);

  try {
    const cityId = CITY;
    if (!cityId) {
      throw "Please specify a city in script for this widget.";
    }
    console.log(`INFO: Using city ID: ${cityId}`);

    const data = await getAqiData(cityId);

    const aqi = data.aqi
    const aqiText = aqi.toString();
    const level = calculateLevel(aqi);
    const cityLocation = await getLocation(data)

    renderWidgetBackgroudGradient(level)
    setWidgetText(level, aqiText, cityLocation, data)

    const detailUrl = `https://aqicn.org/city/${CITY}/`;
    listWidget.url = detailUrl;

  } catch (error) {
    if (error === 666) {
      // Handle JSON parsing errors with a custom error layout
      handleJsonParsingError()
    } else {
      handleWidgetRenderingError(error)
    }
  }

  if (config.runsInApp) {
    listWidget.presentSmall();
  }

  Script.setWidget(listWidget);
  Script.complete();

  function handleWidgetRenderingError(error) {
    console.log(`ERROR: Could not render widget: ${error}`)

    const errorWidgetText = listWidget.addText(`${error}`)
    errorWidgetText.textColor = Color.red()
    errorWidgetText.textOpacity = 30
    errorWidgetText.font = Font.regularSystemFont(10)
  }

  function handleJsonParsingError() {
    listWidget.background = new Color('999999')
    const header = listWidget.addText('Error'.toUpperCase())
    header.textColor = new Color('000000')
    header.font = Font.regularSystemFont(11)
    header.minimumScaleFactor = 0.50

    listWidget.addSpacer(15)

    const wordLevel = listWidget.addText(`Couldn't connect to the server.`)
    wordLevel.textColor = new Color('000000')
    wordLevel.font = Font.semiboldSystemFont(15)
    wordLevel.minimumScaleFactor = 0.3
  }

  function setWidgetText(level, aqiText, cityLocation, data) {
    const textColor = Color.dynamic(new Color(level.textColor), new Color(level.darkTextColor))
    const header = listWidget.addText('Air Quality'.toUpperCase())
    header.textColor = textColor
    header.font = Font.regularSystemFont(11)
    header.minimumScaleFactor = 0.50

    const wordLevel = listWidget.addText(level.label)
    wordLevel.textColor = textColor
    wordLevel.font = Font.semiboldSystemFont(25)
    wordLevel.minimumScaleFactor = 0.3

    listWidget.addSpacer(5)

    const scoreStack = listWidget.addStack()
    const content = scoreStack.addText(aqiText)
    content.textColor = textColor
    content.font = Font.semiboldSystemFont(30)

    listWidget.addSpacer(10)

    const locationText = listWidget.addText(cityLocation)
    locationText.textColor = textColor
    locationText.font = Font.regularSystemFont(14)
    locationText.minimumScaleFactor = 0.5

    listWidget.addSpacer(2)

    const updatedAt = new Date(data.time_stamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
    const widgetText = listWidget.addText(`Updated ${updatedAt}`)
    widgetText.textColor = textColor
    widgetText.font = Font.regularSystemFont(9)
    widgetText.minimumScaleFactor = 0.6
  }

  function renderWidgetBackgroudGradient(level) {
    const startColor = Color.dynamic(new Color(level.startColor), new Color(level.darkStartColor))
    const endColor = Color.dynamic(new Color(level.endColor), new Color(level.darkEndColor))

    const gradient = new LinearGradient()
    gradient.colors = [startColor, endColor]
    gradient.locations = [0.0, 1]
    listWidget.backgroundGradient = gradient
  }
}

await run();