// Disaster Prediction Model
let disasterModel;

// Load training data from CSV
async function loadTrainingData() {
    const response = await fetch('historical_data.csv');
    const csvData = await response.text();
    
    const lines = csvData.split('\n').slice(1); // Skip header
    const features = [];
    const labels = [];
    
    lines.forEach(line => {
        if (!line.trim()) return;
        
        const [temp, humidity, pressure, wind, rain, disaster] = line.split(',');
        
        features.push([
            parseFloat(temp),
            parseFloat(humidity),
            parseFloat(pressure),
            parseFloat(wind),
            parseFloat(rain)
        ]);
        
        // One-hot encoding
        switch(disaster.trim()) {
            case 'flood': labels.push([1, 0, 0, 0]); break;
            case 'wildfire': labels.push([0, 1, 0, 0]); break;
            case 'storm': labels.push([0, 0, 1, 0]); break;
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
    
    // Input layer
    model.add(tf.layers.dense({
        units: 16,
        activation: 'relu',
        inputShape: [5]
    }));
    
    // Hidden layer
    model.add(tf.layers.dense({
        units: 8,
        activation: 'relu'
    }));
    
    // Output layer (4 classes)
    model.add(tf.layers.dense({
        units: 4,
        activation: 'softmax'
    }));
    
    // Compile model
    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });
    
    // Load and train
    const { features, labels } = await loadTrainingData();
    await model.fit(features, labels, {
        epochs: 100,
        batchSize: 4,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}`);
            }
        }
    });
    
    console.log("Model trained!");
    return model;
}

// Prediction function
async function predictDisaster(model, inputData) {
    const inputTensor = tf.tensor2d([[
        inputData.temp,
        inputData.humidity,
        inputData.pressure,
        inputData.wind_speed,
        inputData.rain
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