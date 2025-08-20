# 🔍 Qdrant Vector Explorer

A web application to visualize and explore vectors stored in Qdrant in 2D/3D space.

## Features

- **📊 Interactive Visualization**: 2D and 3D scatter plots using Plotly
- **🔧 Multiple Reduction Methods**: PCA, UMAP, and t-SNE dimensionality reduction
- **🎨 Color Coding**: Color points by cluster, pHash, or upload date
- **🔍 Nearest Neighbors**: Click any point to find its nearest neighbors
- **📈 Real-time Statistics**: View total points, vectors, and unique pHash counts
- **🖼️ Image Preview**: See actual images in the neighbors list

## Prerequisites

- Qdrant running on `http://localhost:6333`
- Python 3.6+ (for the server)
- Modern web browser

## Quick Start

1. **Start the server**:
   ```bash
   cd vector-explorer
   python server.py
   ```

2. **Open your browser** and go to:
   ```
   http://localhost:8081
   ```

3. **Load your data** by clicking the "🔄 Load Data" button

## How to Use

### 1. Load Data
- Click "🔄 Load Data" to fetch vectors from Qdrant
- The app will automatically load up to 1000 points from the `images` collection

### 2. Choose Visualization
- **Dimensionality Reduction**: Select PCA, UMAP, or t-SNE (2D or 3D)
- **Color By**: Choose how to color the points (cluster, pHash, upload date)
- **Size By**: Choose point size (uniform or similarity-based)

### 3. Explore Vectors
- **Click any point** to select it and see its nearest neighbors
- **Hover over points** to see details (ID, pHash, creation date)
- **Use plot controls** to zoom, pan, and rotate (3D)

### 4. Analyze Neighbors
- When you click a point, the app shows its nearest neighbors
- Each neighbor displays:
  - Thumbnail image
  - Point ID
  - pHash value
  - Similarity score

## Understanding the Visualization

### Color Coding
- **Cluster**: Points are colored by pHash prefix (similar images get same color)
- **pHash**: Points are colored by their full perceptual hash
- **Upload Date**: Points are colored by when they were uploaded

### Dimensionality Reduction
- **PCA**: Linear dimensionality reduction, preserves global structure
- **UMAP**: Non-linear reduction, preserves both local and global structure
- **t-SNE**: Non-linear reduction, focuses on local structure

### What the Visualization Shows
- **Similar images** will appear close together in the plot
- **Different images** will be far apart
- **Clusters** of similar images will form visible groups
- **Anomalies** will appear as isolated points

## Troubleshooting

### No Vectors Found
If you see "No points with vectors found":
1. Upload new images to your main application
2. Make sure the embedding service is working
3. Check that vectors are being stored in Qdrant

### CORS Errors
If you see CORS errors in the browser console:
1. Make sure you're using the provided Python server
2. Check that Qdrant is running on the correct port
3. Verify the Qdrant URL in the JavaScript code

### Performance Issues
- For large datasets (>1000 points), the app may be slow
- Try reducing the number of points or using PCA instead of UMAP
- 3D visualizations are more resource-intensive than 2D

## Technical Details

### Libraries Used
- **Plotly.js**: Interactive plotting and visualization
- **TensorFlow.js**: PCA implementation
- **UMAP.js**: UMAP dimensionality reduction
- **Vanilla JavaScript**: No framework dependencies

### API Endpoints
The app connects to Qdrant's REST API:
- `GET /collections/{name}/points/scroll` - Fetch points with vectors
- `POST /collections/{name}/points/search` - Find nearest neighbors

### File Structure
```
vector-explorer/
├── index.html          # Main HTML file
├── app.js             # JavaScript application
├── server.py          # Python HTTP server
└── README.md          # This file
```

## Customization

### Change Qdrant URL
Edit the `qdrantUrl` in `app.js`:
```javascript
this.qdrantUrl = 'http://your-qdrant-host:6333';
```

### Change Collection Name
Edit the `collectionName` in `app.js`:
```javascript
this.collectionName = 'your-collection-name';
```

### Add New Color Schemes
Modify the `createColorMap` function in `app.js` to add new coloring options.

## Contributing

Feel free to submit issues and enhancement requests!
