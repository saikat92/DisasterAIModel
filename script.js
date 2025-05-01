// const OPENWEATHER_API_KEY = "0a35cf2a6b029e0c40aa09f89a04a018";
// WEATHERSTACK_API_KEY = "4e29165ac4c21e84fa133b49a95d8b6f";
const OPENWEATHER_API_KEY = "0a35cf2a6b029e0c40aa09f89a04a018";
const WEATHERSTACK_API_KEY = "4e29165ac4c21e84fa133b49a95d8b6f";
const ELEVATION_API_KEY = "YOUR_ELEVATION_API_KEY"; // Get from OpenTopoData or similar

let map, weatherChart;
let currentLocation = {};

const elements = {
    locationInput: document.getElementById("location-input"),
    searchBtn: document.getElementById("search-btn"),
    locationName: document.getElementById("location-name"),
    temp: document.getElementById("temp"),
    feelsLike:document.getElementById("feelsLike"),
    humidity: document.getElementById("humidity"),
    wind: document.getElementById("wind"),
    rain: document.getElementById("rain"),
    pressure: document.getElementById("pressure"),
    elevation: document.getElementById("elevation"),
    riskIndicator: document.getElementById("risk-indicator"),
    aiMessage: document.getElementById("ai-message"),
    floodRisk: document.getElementById("flood-risk"),
    fireRisk: document.getElementById("fire-risk"),
    stormRisk: document.getElementById("storm-risk"),
    resetBtn: document.getElementById("reset-btn"),
    refreshBtn: document.getElementById("refresh-btn"),
    loadingIndicator: document.getElementById("loading-indicator"),
    loadingText: document.getElementById("loading-text")
};

document.addEventListener("DOMContentLoaded", async () => {
    elements.loadingIndicator.classList.add("visible");
    elements.loadingText.textContent = "AI model loading...";
    
    try {
        disasterModel = await window.trainModel();
        console.log("AI model loaded");
        elements.loadingText.textContent = "AI model loaded! Ready to analyze";
        
        // Hide loading after delay
        setTimeout(() => {
            elements.loadingIndicator.classList.remove("visible");
        }, 2000);
    } catch (error) {
        elements.loadingText.textContent = "Error loading AI model";
        console.error("Model loading failed:", error);
    }
    
    // Event listeners
    elements.searchBtn.addEventListener("click", handleSearch);
    elements.resetBtn.addEventListener("click", resetApp);
    elements.refreshBtn.addEventListener("click", () => location.reload(true));
    
    elements.locationInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
});

async function handleSearch() {
    const location = elements.locationInput.value.trim();
    if (!location) return alert("Please enter a location");

    try {
        elements.searchBtn.disabled = true;
        elements.searchBtn.textContent = "Analyzing...";
        
        // Get coordinates and elevation first
        currentLocation = await getCoordinates(location);
        // console.log(currentLocation);
        currentLocation.elevation = await getElevation(currentLocation.lat, currentLocation.lon);
        // console.log(currentLocation.elevation);
        
        // Fetch all data in parallel
        const [currentWeather, historicalData] = await Promise.all([
            fetchCurrentWeather(location),
            fetchNASAData(currentLocation)
        ]);

        // console.log(currentWeather);
        // console.log(historicalData);

        updateCurrentWeatherUI(currentWeather);
        updateHistoricalChart(historicalData);

        // Get current month and hour
        const now = new Date();
        console.log(now);
        const prediction = await window.predictDisaster(
            disasterModel,
            {
                temp: currentWeather.temp,
                humidity: currentWeather.humidity,
                pressure: currentWeather.pressure,
                wind_speed: currentWeather.windSpeed,
                rain_1h: currentWeather.rain || 0,
                latitude: currentLocation.lat,
                longitude: currentLocation.lon,
                elevation: currentLocation.elevation,
                month: now.getMonth() + 1,
                hour: now.getHours(),
                vegetation: 'forest', // Default, can be enhanced
                soil_type: 'loam',   // Default, can be enhanced
                soil_moisture: historicalData[0]?.humidity || 50, // Use recent humidity as proxy
                urban_rural: currentLocation.elevation < 300 ? 'urban' : 'rural',
                ocean_current: 'normal' // Default, can be enhanced
            }
        );

        updateRiskUI(prediction);
        updateRiskMap(currentLocation, prediction);
        
    } catch (error) {
        console.error("Error:", error);
        alert(`Error: ${error.message}`);
    } finally {
        elements.searchBtn.disabled = false;
        elements.searchBtn.textContent = "Analyze";
    }
}

async function getCoordinates(location) {
    const response = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${location}&limit=1&appid=${OPENWEATHER_API_KEY}`
    );
    const data = await response.json();
    if (!data.length) throw new Error("Location not found");
    return { 
        lat: data[0].lat, 
        lon: data[0].lon, 
        name: data[0].name,
        country: data[0].country
    };
}


async function getElevation(lat, lon) {
    const res = await fetch(`http://localhost:3000/elevation?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    return data.results[0].elevation;
  }
  

async function fetchCurrentWeather(location) {
    const response = await fetch(
        `http://api.weatherstack.com/current?access_key=${WEATHERSTACK_API_KEY}&query=${location}`
    );

    if (!response.ok) throw new Error("Weather data unavailable");
    const data = await response.json();

    if (data.success === false || !data.current) {
        throw new Error(data.error?.info || "Invalid response from weather API");
    }

    return {
        temp: data.current.temperature,
        feelsLike: data.current.feelslike,
        humidity: data.current.humidity,
        pressure: data.current.pressure,
        windSpeed: data.current.wind_speed,
        rain: data.current.precip,
        conditions: data.current.weather_descriptions[0]
    };
}

async function fetchNASAData({ lat, lon }) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    
    const dateFormat = (date) => date.toISOString().split('T')[0].replace(/-/g, '');

    const response = await fetch(
        `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,PS,WS10M,PRECTOT&community=RE&longitude=${lon}&latitude=${lat}&start=${dateFormat(startDate)}&end=${dateFormat(endDate)}&format=JSON`
    );
    
    if (!response.ok) throw new Error("NASA data unavailable");
    const data = await response.json();
    
    const props = data.properties.parameter;
    const dates = Object.keys(props.T2M).sort();

    return dates
        .map(date => ({
            date: date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            temp: props.T2M[date],
            humidity: props.RH2M[date],
            pressure: props.PS[date],
            wind_speed: props.WS10M[date],
            rain: props.PRECTOTCORR[date]
        }))
        .filter(entry => entry.temp !== -999);
}

function updateCurrentWeatherUI(data) {
    elements.locationName.textContent = `${currentLocation.name}, ${currentLocation.country}`;
    elements.temp.textContent = `${Math.round(data.temp)}°C`;
    elements.feelsLike.textContent = `${"Feels Like: "+Math.round(data.feelsLike)}°C`;
    elements.humidity.textContent = `${data.humidity}%`;
    elements.wind.textContent = `${Math.round(data.windSpeed * 3.6)} km/h`;
    elements.rain.textContent = data.rain ? `${data.rain} mm` : `0 mm`;
    elements.pressure.textContent = `${data.pressure} hPa`;
    elements.elevation.textContent = `${Math.round(currentLocation.elevation)} m`;
}

function updateHistoricalChart(data) {
    const ctx = document.getElementById('history-chart').getContext('2d');
    
    if (weatherChart) weatherChart.destroy();
    
    weatherChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: data.map(d => d.temp),
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3
                },
                {
                    label: 'Humidity (%)',
                    data: data.map(d => d.humidity),
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    yAxisID: 'y1'
                },
                {
                    label: 'Rainfall (mm)',
                    data: data.map(d => d.rain),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    yAxisID: 'y2',
                    type: 'bar'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '7-Day Historical Weather'
                },
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { text: 'Temperature (°C)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { text: 'Humidity (%)' },
                    grid: { drawOnChartArea: false },
                    min: 0,
                    max: 100
                },
                y2: {
                    type: 'linear',
                    display: false,
                    min: 0
                }
            }
        }
    });
}

function updateRiskUI(prediction) {
    const risks = [
        { type: "flood", value: prediction.flood },
        { type: "wildfire", value: prediction.wildfire },
        { type: "storm", value: prediction.storm }
    ];
    
    const highestRisk = risks.reduce((a, b) => a.value > b.value ? a : b);
    
    let riskLevel = "Low";
    if (highestRisk.value > 0.7) riskLevel = "High";
    else if (highestRisk.value > 0.4) riskLevel = "Moderate";
    
    elements.riskIndicator.textContent = riskLevel;
    elements.riskIndicator.className = `${riskLevel.toLowerCase()}-risk`;
    elements.aiMessage.textContent = generateRiskMessage(highestRisk);
    
    elements.floodRisk.textContent = `${Math.round(prediction.flood * 100)}%`;
    elements.fireRisk.textContent = `${Math.round(prediction.wildfire * 100)}%`;
    elements.stormRisk.textContent = `${Math.round(prediction.storm * 100)}%`;
    
    document.querySelector(".flood .bar").style.width = `${prediction.flood * 100}%`;
    document.querySelector(".fire .bar").style.width = `${prediction.wildfire * 100}%`;
    document.querySelector(".storm .bar").style.width = `${prediction.storm * 100}%`;
}

function generateRiskMessage(highestRisk) {
    const messages = {
        flood: `Flood risk (${Math.round(highestRisk.value * 100)}%) - Monitor water levels`,
        wildfire: `Fire risk (${Math.round(highestRisk.value * 100)}%) - Extreme caution advised`,
        storm: `Storm risk (${Math.round(highestRisk.value * 100)}%) - Secure outdoor items`,
        none: "No significant risks identified"
    };
    
    return highestRisk.value > 0.4 ? messages[highestRisk.type] : messages.none;
}

function updateRiskMap(coords, prediction) {
    if (!map) {
        map = L.map('map').setView([coords.lat, coords.lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    } else {
        map.setView([coords.lat, coords.lon], 10);
    }
    
    map.eachLayer(layer => {
        if (layer instanceof L.Circle) map.removeLayer(layer);
    });
    
    const addRiskCircle = (riskType, value, color) => {
        if (value > 0.2) {
            L.circle([coords.lat, coords.lon], {
                color: color,
                fillColor: color,
                fillOpacity: 0.2,
                radius: value * 15000 + 5000 // Minimum 5km radius
            }).addTo(map).bindPopup(`${riskType} Risk: ${Math.round(value * 100)}%`);
        }
    };
    
    addRiskCircle('Flood', prediction.flood, '#3498db');
    addRiskCircle('Wildfire', prediction.wildfire, '#e67e22');
    addRiskCircle('Storm', prediction.storm, '#9b59b6');
}

function resetApp() {
    // Clear inputs
    elements.locationInput.value = "";
    
    // Reset UI elements
    elements.locationName.textContent = "Search a location";
    elements.temp.textContent = "-";
    elements.feelsLike.textContent = "-";
    elements.humidity.textContent = "-";
    elements.wind.textContent = "-";
    elements.rain.textContent = "-";
    elements.pressure.textContent = "-";
    elements.elevation.textContent = "-";
    
    // Reset risk indicators
    elements.riskIndicator.textContent = "Low";
    elements.riskIndicator.className = "low-risk";
    elements.aiMessage.textContent = "No data analyzed yet";
    elements.floodRisk.textContent = "0%";
    elements.fireRisk.textContent = "0%";
    elements.stormRisk.textContent = "0%";
    
    // Reset bars
    document.querySelector(".flood .bar").style.width = "0%";
    document.querySelector(".fire .bar").style.width = "0%";
    document.querySelector(".storm .bar").style.width = "0%";
    
    // Reset map
    if (map) {
        map.eachLayer(layer => {
            if (layer instanceof L.Circle) map.removeLayer(layer);
        });
    }
    
    // Reset chart
    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }
    
    console.log("Application reset");
}