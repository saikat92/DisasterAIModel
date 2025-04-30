import pandas as pd
import numpy as np
from scipy.stats import gamma, weibull_min, beta
import random
from datetime import datetime, timedelta

def generate_complete_disaster_data(num_samples=10000):
    # Seed for reproducibility
    np.random.seed(42)
    random.seed(42)
    
    # Constants
    VEGETATION_TYPES = ['forest', 'grassland', 'shrubland', 'urban', 'cropland', 'wetland']
    SOIL_TYPES = ['clay', 'silt', 'sand', 'loam']
    
    data = []
    start_date = datetime(2020, 1, 1)
    
    for idx in range(num_samples):
        # ===== GEOSPATIAL CONTEXT =====
        latitude = np.random.uniform(-90, 90)
        longitude = np.random.uniform(-180, 180)
        
        # Region classification
        is_coastal = (np.abs(latitude) < 45) and (random.random() > 0.3)
        is_arid = (np.abs(latitude) > 30) and (random.random() > 0.6)
        is_urban = random.random() > 0.8
        
        # Elevation (meters) with regional biases
        if is_coastal:
            elevation = np.random.gamma(shape=1.5, scale=200)
        elif is_arid:
            elevation = np.random.uniform(500, 3000)
        else:
            elevation = np.random.gamma(shape=2, scale=400)
        
        # Ocean current effects
        cool_current = (
            (-150 < longitude < -70) or  # Americas
            (5 < longitude < 20)         # Africa/Europe
        )
        
        # Vegetation type (based on region)
        if is_urban:
            veg_type = 'urban'
        elif is_coastal:
            veg_type = random.choice(['wetland', 'forest', 'grassland'])
        elif is_arid:
            veg_type = random.choice(['shrubland', 'grassland'])
        else:
            veg_type = random.choice(VEGETATION_TYPES[:-1])  # Exclude urban
        
        # Soil type (correlated with vegetation)
        if veg_type == 'wetland':
            soil_type = 'clay'
        elif veg_type == 'forest':
            soil_type = random.choice(['loam', 'silt'])
        else:
            soil_type = random.choice(SOIL_TYPES)
        
        # ===== TEMPORAL EFFECTS =====
        date = start_date + timedelta(hours=idx)
        month = date.month
        hour = date.hour
        is_daytime = 6 <= hour < 18
        
        # Seasonal flags
        if latitude > 0:  # Northern hemisphere
            is_summer = month in [6, 7, 8]
            is_monsoon = month in [6, 7, 8, 9]
        else:             # Southern hemisphere
            is_summer = month in [12, 1, 2]
            is_monsoon = month in [1, 2, 3, 12]
        
        # ===== WEATHER GENERATION =====
        # Base temperature (with all modifiers)
        temp = np.random.normal(
            loc=(
                28 if is_coastal else 
                32 if is_arid else 
                22
            ) + (
                -5 if cool_current else 
                +3 if (is_urban and not is_coastal) else 
                0
            ) - (0.0065 * elevation) + 
            (3 if is_daytime else -4) +  # Diurnal cycle
            (2 if is_summer else -2),    # Seasonal effect
            scale=5
        )
        
        # Humidity (geographically constrained)
        humidity = np.clip(
            np.random.normal(
                loc=(
                    75 if is_coastal else 
                    18 if is_arid else 
                    60
                ) + (
                    -10 if is_urban else 
                    +15 if veg_type == 'wetland' else 
                    0
                ) + (
                    -5 if is_daytime else +8  # Day-night cycle
                ),
                scale=10
            ), 10, 100
        )
        
        # Pressure (elevation-adjusted)
        pressure = 1015 - (elevation/100) + np.random.normal(0, 5)
        
        # Wind (regional and elevation effects)
        wind_speed = weibull_min.rvs(
            2, 
            loc=0, 
            scale=(
                18 if is_coastal or (is_arid and elevation > 1000) else 
                12
            ) * (1.3 if is_urban else 1) * 
            (1.2 if is_daytime else 0.8)  # Daytime windier
        )
        
        # Rainfall (gamma distribution with geographic triggers)
        rain_1h = 0
        if is_monsoon or (is_coastal and random.random() > 0.6):
            rain_1h = gamma.rvs(0.6, scale=3) 
            if elevation > 1500:  # Orographic lift
                rain_1h *= 1.5
            if veg_type == 'forest':  # Forests increase rainfall
                rain_1h *= 1.2
        
        # Soil moisture (beta distribution, 0-100%)
        soil_moisture = beta.rvs(
            a=2, 
            b=5 if is_arid else (2 if is_coastal else 3),
            scale=100
        ) * (
            1.3 if rain_1h > 5 else 
            0.7 if veg_type == 'urban' else 
            1.0
        )
        
        # ===== DISASTER TRIGGERS =====
        disaster = "none"
        
        # Floods (soil moisture + rain + elevation)
        if (soil_moisture > 60 and rain_1h > 10) or (rain_1h > 20 and elevation < 300):
            disaster = "flood"
            pressure -= np.random.uniform(5, 15)
            
        # Wildfires (vegetation + weather)
        elif (veg_type in ['forest', 'shrubland', 'grassland'] and 
              temp > 35 and humidity < 25 and wind_speed > 10 and 
              soil_moisture < 30 and rain_1h < 0.1):
            disaster = "wildfire"
            wind_speed *= np.random.uniform(1.2, 1.8)
            
        # Storms (pressure + wind)
        elif wind_speed > 25 and (rain_1h > 5 or is_coastal):
            disaster = "storm"
            pressure -= np.random.uniform(15, 25)
            rain_1h = max(rain_1h, np.random.gamma(1, scale=8))
        
        # Urban disasters
        if is_urban and disaster == "none":
            if temp > 38 and humidity > 70:
                disaster = "urban_flood" if rain_1h > 5 else "heatwave"
            elif wind_speed > 30:
                disaster = "wind_damage"
        
        data.append([
            round(temp, 1),
            int(humidity),
            int(pressure),
            round(wind_speed, 1),
            round(rain_1h, 1),
            disaster,
            round(latitude, 4),
            round(longitude, 4),
            int(elevation),
            date.strftime("%Y-%m-%d %H:%M:%S"),
            month,
            hour,
            veg_type,
            soil_type,
            round(soil_moisture, 1),
            "urban" if is_urban else "rural",
            "cool_current" if cool_current else "normal"
        ])
    
    return pd.DataFrame(data, columns=[
        'temp', 'humidity', 'pressure', 'wind_speed', 'rain_1h', 
        'disaster_type', 'latitude', 'longitude', 'elevation',
        'timestamp', 'month', 'hour', 'vegetation', 'soil_type',
        'soil_moisture', 'urban_rural', 'ocean_current'
    ])

# Generate and save
print("Generating realistic disaster data...")
df = generate_complete_disaster_data(10000)
df.to_csv("complete_disaster_data.csv", index=False)
print("Data generation complete. Saved to complete_disaster_data.csv")