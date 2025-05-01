// Disaster Prediction Model
let disasterModel;

// Load training data from CSV
async function loadTrainingData() {
    const response = await fetch('complete_disaster_data.csv');
    const csvData = await response.text();
    
    const lines = csvData.split('\n').slice(1); // Skip header
    const features = [];
    const labels = [];
    
    lines.forEach(line => {
        if (!line.trim()) return;
        
        const cols = line.split(',');
        const [
            temp, humidity, pressure, wind_speed, rain_1h,
            disaster_type, latitude, longitude, elevation,
            timestamp, month, hour, vegetation, soil_type,
            soil_moisture, urban_rural, ocean_current
        ] = cols;
        
        // Convert categorical features to numerical
        const vegMap = {
            'forest': 0, 'grassland': 1, 'shrubland': 2,
            'urban': 3, 'cropland': 4, 'wetland': 5
        };
        const soilMap = {'clay': 0, 'silt': 1, 'sand': 2, 'loam': 3};
        const urbanMap = {'urban': 1, 'rural': 0};
        const currentMap = {'cool_current': 1, 'normal': 0};
        
        features.push([
            parseFloat(temp),
            parseFloat(humidity),
            parseFloat(pressure),
            parseFloat(wind_speed),
            parseFloat(rain_1h),
            parseFloat(latitude),
            parseFloat(longitude),
            parseFloat(elevation),
            parseInt(month),
            parseInt(hour),
            vegMap[vegetation.trim().toLowerCase()] || 0,
            soilMap[soil_type.trim().toLowerCase()] || 0,
            parseFloat(soil_moisture),
            urbanMap[urban_rural.trim().toLowerCase()] || 0,
            currentMap[ocean_current.trim().toLowerCase()] || 0
        ]);
        
        // One-hot encoding for disasters
        switch(disaster_type.trim().toLowerCase()) {
            case 'flood': labels.push([1, 0, 0, 0]); break;
            case 'wildfire': labels.push([0, 1, 0, 0]); break;
            case 'storm': labels.push([0, 0, 1, 0]); break;
            case 'urban_flood': labels.push([1, 0, 0, 0]); break;
            case 'heatwave': labels.push([0, 1, 0, 0]); break;
            case 'wind_damage': labels.push([0, 0, 1, 0]); break;
            default: labels.push([0, 0, 0, 1]); // none
        }
    });
    
    return {
        features: tf.tensor2d(features),
        labels: tf.tensor2d(labels)
    };
}

// Create and train model
async function createAndTrainModel() {
    console.log("Training model...");
    
    const model = tf.sequential();
    
    // Input layer (15 features now)
    model.add(tf.layers.dense({
        units: 32,
        activation: 'relu',
        inputShape: [15]
    }));
    
    // Hidden layers
    model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    
    // Output layer (4 classes)
    model.add(tf.layers.dense({
        units: 4,
        activation: 'softmax'
    }));
    
    // Compile model
    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });
    
    // Load and train
    const { features, labels } = await loadTrainingData();
    await model.fit(features, labels, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, acc = ${logs.acc.toFixed(4)}`);
            }
        }
    });
    
    console.log("Model trained!");
    return model;
}

// Enhanced prediction function
async function predictDisaster(model, inputData) {
    // Map categorical data
    const vegMap = { forest:0, grassland:1, shrubland:2, urban:3, cropland:4, wetland:5 };
    const soilMap = { clay:0, silt:1, sand:2, loam:3 };
    
    const inputTensor = tf.tensor2d([[
        inputData.temp,
        inputData.humidity,
        inputData.pressure,
        inputData.wind_speed,
        inputData.rain_1h,
        inputData.latitude || 0,
        inputData.longitude || 0,
        inputData.elevation || 0,
        inputData.month || new Date().getMonth() + 1,
        inputData.hour || new Date().getHours(),
        vegMap[inputData.vegetation?.toLowerCase() || 'forest'],
        soilMap[inputData.soil_type?.toLowerCase() || 'loam'],
        inputData.soil_moisture || 50,
        inputData.urban_rural === 'urban' ? 1 : 0,
        inputData.ocean_current === 'cool_current' ? 1 : 0
    ]]);
    
    const prediction = model.predict(inputTensor);
    const results = await prediction.data();
    
    return {
        flood: results[0],
        wildfire: results[1],
        storm: results[2],
        none: results[3]
    };
}

// Initialize when page loads
window.trainModel = createAndTrainModel;
window.predictDisaster = predictDisaster;