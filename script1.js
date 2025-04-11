const OPENWEATHER_API_KEY = "0a35cf2a6b029e0c40aa09f89a04a018";
let map, weatherChart;

const elements = {
    locationInput: document.getElementById("location-input"),
    searchBtn: document.getElementById("search-btn"),
    locationName: document.getElementById("location-name"),
    temp: document.getElementById("temp"),
    humidity: document.getElementById("humidity"),
    wind: document.getElementById("wind"),
    rain: document.getElementById("rain"),
    riskIndicator: document.getElementById("risk-indicator"),
    aiMessage: document.getElementById("ai-message"),
    floodRisk: document.getElementById("flood-risk"),
    fireRisk: document.getElementById("fire-risk"),
    stormRisk: document.getElementById("storm-risk")
};

document.addEventListener("DOMContentLoaded", async () => {
    // Load AI model
    disasterModel = await window.trainModel();
    console.log("AI model loaded");
    
    // Event listeners
    elements.searchBtn.addEventListener("click", handleSearch);
    elements.locationInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch();
    });
});

async function handleSearch() {
    console.log("Search initiated"); // Debug log
    const location = elements.locationInput.value.trim();
    // console.log(location);
    if (!location) return alert("Please enter a location");

    try {
       
        elements.searchBtn.disabled = true;
        elements.searchBtn.textContent = "Analyzing...";
        
        const coords = await getCoordinates(location);
        console.log(coords);
        if (!coords) return;

        const currentWeather = await fetchCurrentWeather(coords);
        console.log(currentWeather);

        const historicalData = await fetchNASAData(coords);
        console.log(historicalData);

        updateCurrentWeatherUI(currentWeather);
        updateHistoricalChart(historicalData);

        const prediction = await window.predictDisaster(
            disasterModel,
            {
                temp: currentWeather.temp,
                humidity: currentWeather.humidity,
                pressure: currentWeather.pressure,
                wind_speed: currentWeather.wind_speed,
                rain: currentWeather.rain || 0
            }
        );

        console.log(prediction);
        updateRiskUI(prediction);
        updateRiskMap(coords, prediction);
        // Rest of your code...
        
    } catch (error) {
        console.error("Error in handleSearch:", error);
        alert(`Error: ${error.message}`);
    }
}

// get coordinates
async function getCoordinates(location) {
    const response = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${location}&limit=1&appid=${OPENWEATHER_API_KEY}`
    );
    const data = await response.json();
    if (!data.length) throw new Error("Location not found");
    return { lat: data[0].lat, lon: data[0].lon, name: data[0].name };
}

// get weather data
async function fetchCurrentWeather({ lat, lon }) {
    const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    if (!response.ok) throw new Error("Weather data unavailable");
    const data = await response.json();
    
    return {
        temp: data.main.temp,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        wind_speed: data.wind.speed,
        rain: data.rain?.["1h"],
        conditions: data.weather[0].description
    };
}

// fetch nasa data

async function fetchNASAData({ lat, lon }) {
    // NASA POWER API (7-day historical data)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    
    const dateFormat = (date) => date.toISOString().split('T')[0].replace(/-/g, '');
    console.log(lat);
    console.log(lon);
    console.log(dateFormat(startDate));
    console.log(dateFormat(endDate));

    const response = await fetch(
        `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,PS,WS10M,PRECTOT&community=RE&longitude=${lon}&latitude=${lat}&start=${dateFormat(startDate)}&end=${dateFormat(endDate)}&format=JSON`
    );
    
    if (!response.ok) throw new Error("NASA data unavailable");
    const data = await response.json();
    
    const props = data.properties.parameter;

    // Get all dates from one of the keys (e.g. T2M)
    const dates = Object.keys(props.T2M).sort();


    const dailyArray = dates
        .map(date => ({
            date: date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            temp: props.T2M[date],
            humidity: props.RH2M[date],
            pressure: props.PS[date],
            wind_speed: props.WS10M[date],
            rain: props.PRECTOTCORR[date]
        }))
        .filter(entry =>
            entry.temp !== -999 &&
            entry.humidity !== -999 &&
            entry.pressure !== -999 &&
            entry.wind_speed !== -999 &&
            entry.rain !== -999
        );

    return dailyArray;
}

// UI Update Functions
function updateCurrentWeatherUI(data) {
    const elements = {
        temp: document.getElementById('temp'),
        humidity: document.getElementById('humidity'),
        wind: document.getElementById('wind'),
        rain: document.getElementById('rain')
    };

    if (elements.temp) elements.temp.textContent = `${Math.round(data.temp)}°C`;
    if (elements.humidity) elements.humidity.textContent = `${data.humidity}%`;
    if (elements.wind) elements.wind.textContent = `${Math.round(data.wind_speed * 3.6)} km/h`;
    if (elements.rain) elements.rain.textContent = data.rain ? `${data.rain} mm` : `0 mm`;
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
                    label: 'Rainfall (mm)',
                    data: data.map(d => d.rain),
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    yAxisID: 'y1',
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
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Rainfall (mm)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    }
                }
            }
        }
    });
}

function updateRiskUI(prediction) {
    // Get highest risk
    const risks = [
        { type: "flood", value: prediction.flood },
        { type: "wildfire", value: prediction.wildfire },
        { type: "storm", value: prediction.storm }
    ];
    
    const highestRisk = risks.reduce((a, b) => a.value > b.value ? a : b);
    
    // Set risk level
    let riskLevel = "Low";
    if (highestRisk.value > 0.7) riskLevel = "High";
    else if (highestRisk.value > 0.4) riskLevel = "Moderate";
    
    elements.riskIndicator.textContent = riskLevel;
    elements.riskIndicator.className = `${riskLevel.toLowerCase()}-risk`;
    
    // Set AI message
    elements.aiMessage.textContent = generateRiskMessage(highestRisk);
    
    // Update risk bars
    elements.floodRisk.textContent = `${Math.round(prediction.flood * 100)}%`;
    elements.fireRisk.textContent = `${Math.round(prediction.wildfire * 100)}%`;
    elements.stormRisk.textContent = `${Math.round(prediction.storm * 100)}%`;
    
    // Animate bars
    document.querySelector(".flood .bar").style.width = `${prediction.flood * 100}%`;
    document.querySelector(".fire .bar").style.width = `${prediction.wildfire * 100}%`;
    document.querySelector(".storm .bar").style.width = `${prediction.storm * 100}%`;
}

function generateRiskMessage(highestRisk) {
    const messages = {
        flood: "High flood risk due to recent rainfall patterns",
        wildfire: "Elevated wildfire risk from dry conditions",
        storm: "Potential storm activity detected",
        none: "No significant risks identified"
    };
    
    return highestRisk.value > 0.4 ? messages[highestRisk.type] : messages.none;
}

function updateRiskMap(coords, prediction) {
    // Initialize map if not exists
    if (!map) {
        map = L.map('map').setView([coords.lat, coords.lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    } else {
        map.setView([coords.lat, coords.lon], 10);
    }
    
    // Clear previous layers
    map.eachLayer(layer => {
        if (layer instanceof L.Circle) map.removeLayer(layer);
    });
    
    // Add risk circles
    if (prediction.flood > 0.3) {
        L.circle([coords.lat, coords.lon], {
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.2,
            radius: prediction.flood * 20000
        }).addTo(map).bindPopup(`Flood Risk: ${Math.round(prediction.flood * 100)}%`);
    }
    
    if (prediction.wildfire > 0.3) {
        L.circle([coords.lat, coords.lon], {
            color: '#e67e22',
            fillColor: '#e67e22',
            fillOpacity: 0.2,
            radius: prediction.wildfire * 20000
        }).addTo(map).bindPopup(`Wildfire Risk: ${Math.round(prediction.wildfire * 100)}%`);
    }
    
    if (prediction.storm > 0.3) {
        L.circle([coords.lat, coords.lon], {
            color: '#9b59b6',
            fillColor: '#9b59b6',
            fillOpacity: 0.2,
            radius: prediction.storm * 20000
        }).addTo(map).bindPopup(`Storm Risk: ${Math.round(prediction.storm * 100)}%`);
    }
}