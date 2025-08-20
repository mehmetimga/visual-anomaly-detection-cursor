class QdrantVectorExplorer {
    constructor() {
        this.qdrantUrl = 'http://localhost:6333';
        this.collectionName = 'images';
        this.points = [];
        this.reducedData = null;
        this.selectedPoint = null;
        this.plot = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('load-data').addEventListener('click', () => this.loadData());
        document.getElementById('clear-selection').addEventListener('click', () => this.clearSelection());
        
        // Auto-load data on page load
        this.loadData();
    }

    showMessage(message, type = 'info') {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        messagesDiv.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    async loadData() {
        try {
            this.showMessage('Loading data from Qdrant...', 'info');
            
            const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/scroll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    limit: 1000,
                    with_payload: true,
                    with_vector: true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.points = data.result.points || [];
            
            this.updateStats();
            this.showMessage(`Loaded ${this.points.length} points from Qdrant`, 'success');
            
            if (this.points.length > 0) {
                await this.performDimensionalityReduction();
            } else {
                this.showMessage('No points found in the collection', 'error');
            }
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showMessage(`Error loading data: ${error.message}`, 'error');
        }
    }

    updateStats() {
        const totalPoints = this.points.length;
        const withVectors = this.points.filter(p => p.vector && p.vector.length > 0).length;
        const uniquePhash = new Set(this.points.map(p => p.payload?.phash).filter(Boolean)).size;
        
        document.getElementById('total-points').textContent = totalPoints;
        document.getElementById('with-vectors').textContent = withVectors;
        document.getElementById('unique-phash').textContent = uniquePhash;
        document.getElementById('selected-point').textContent = this.selectedPoint ? this.selectedPoint.id : '-';
    }

    async performDimensionalityReduction() {
        const method = document.getElementById('reduction-method').value;
        const pointsWithVectors = this.points.filter(p => p.vector && p.vector.length > 0);
        
        if (pointsWithVectors.length === 0) {
            this.showMessage('No points with vectors found. Please upload new images to get vector embeddings.', 'error');
            return;
        }

        this.showMessage(`Performing ${method} dimensionality reduction on ${pointsWithVectors.length} vectors...`, 'info');

        try {
            const vectors = pointsWithVectors.map(p => p.vector);
            
            // Debug: log vector info
            console.log('Vectors sample:', vectors.slice(0, 2));
            console.log('Vector dimensions:', vectors[0]?.length);
            
            let reducedData;
            const is3D = method.includes('3d');
            
            switch (method) {
                case 'pca':
                case 'pca3d':
                    reducedData = await this.performPCA(vectors, is3D ? 3 : 2);
                    break;
                case 'umap':
                case 'umap3d':
                    reducedData = await this.performUMAP(vectors, is3D ? 3 : 2);
                    break;
                case 'tsne':
                    reducedData = await this.performTSNE(vectors);
                    break;
                default:
                    throw new Error(`Unknown reduction method: ${method}`);
            }

            console.log('Reduced data sample:', reducedData.slice(0, 2));
            this.reducedData = reducedData;
            this.renderPlot(pointsWithVectors);
            
        } catch (error) {
            console.error('Error in dimensionality reduction:', error);
            this.showMessage(`Error in dimensionality reduction: ${error.message}`, 'error');
        }
    }

    async performPCA(vectors, dimensions = 2) {
        // Simple PCA implementation using basic linear algebra
        try {
            const n = vectors.length;
            const d = vectors[0].length;
            
            // Center the data
            const mean = new Array(d).fill(0);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < d; j++) {
                    mean[j] += vectors[i][j];
                }
            }
            for (let j = 0; j < d; j++) {
                mean[j] /= n;
            }
            
            const centered = vectors.map(v => v.map((val, j) => val - mean[j]));
            
            // Compute covariance matrix
            const covariance = new Array(d).fill(0).map(() => new Array(d).fill(0));
            for (let i = 0; i < d; i++) {
                for (let j = 0; j < d; j++) {
                    let sum = 0;
                    for (let k = 0; k < n; k++) {
                        sum += centered[k][i] * centered[k][j];
                    }
                    covariance[i][j] = sum / (n - 1);
                }
            }
            
            // Simple eigenvalue decomposition (for small matrices)
            // This is a simplified approach - for production use a proper library
            const eigenvalues = [];
            const eigenvectors = [];
            
            // For 2D projection, just use the first two dimensions
            if (dimensions === 2) {
                return centered.map(v => [v[0], v[1]]);
            } else if (dimensions === 3) {
                return centered.map(v => [v[0], v[1], v[2]]);
            }
            
            // Fallback: use first few dimensions
            return centered.map(v => v.slice(0, dimensions));
            
        } catch (error) {
            console.error('PCA error:', error);
            throw new Error(`PCA failed: ${error.message}`);
        }
    }

    async performUMAP(vectors, dimensions = 2) {
        // Use UMAP.js library
        if (typeof UMAP === 'undefined') {
            console.warn('UMAP.js not loaded, falling back to simple projection');
            // Fallback to simple projection
            if (dimensions === 2) {
                return vectors.map(v => [v[0], v[1]]);
            } else if (dimensions === 3) {
                return vectors.map(v => [v[0], v[1], v[2]]);
            }
            return vectors.map(v => v.slice(0, dimensions));
        }
        
        try {
            const umap = new UMAP({
                nComponents: dimensions,
                nNeighbors: Math.min(15, Math.max(2, vectors.length - 1)),
                minDist: 0.1,
                spread: 1.0
            });
            
            return await umap.fit(vectors);
        } catch (error) {
            console.error('UMAP error:', error);
            console.warn('Falling back to simple projection');
            // Fallback to simple projection
            if (dimensions === 2) {
                return vectors.map(v => [v[0], v[1]]);
            } else if (dimensions === 3) {
                return vectors.map(v => [v[0], v[1], v[2]]);
            }
            return vectors.map(v => v.slice(0, dimensions));
        }
    }

    async performTSNE(vectors) {
        // Simple t-SNE implementation (simplified)
        // For a full implementation, you might want to use a library like tsne-js
        console.warn('t-SNE not implemented, falling back to simple projection');
        
        // Fallback to simple projection using first two dimensions
        return vectors.map(v => [v[0], v[1]]);
    }

    renderPlot(pointsWithVectors) {
        const colorBy = document.getElementById('color-by').value;
        const sizeBy = document.getElementById('size-by').value;
        const is3D = this.reducedData[0].length === 3;

        // Prepare data for plotting
        const traces = this.prepareTraces(pointsWithVectors, colorBy, sizeBy);
        
        const layout = {
            title: `Vector Visualization (${pointsWithVectors.length} points)`,
            width: document.getElementById('plot').offsetWidth,
            height: 600,
            margin: { l: 50, r: 50, t: 50, b: 50 },
            hovermode: 'closest'
        };

        // Add 3D scene configuration only if needed
        if (is3D) {
            layout.scene = {
                xaxis: { title: 'X' },
                yaxis: { title: 'Y' },
                zaxis: { title: 'Z' },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 1.5 }
                }
            };
        } else {
            layout.xaxis = { title: 'X' };
            layout.yaxis = { title: 'Y' };
        }

        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
        };

        try {
            Plotly.newPlot('plot', traces, layout, config).then(() => {
                this.plot = document.getElementById('plot');
                
                // Add click event listener
                this.plot.on('plotly_click', (data) => {
                    const pointIndex = data.points[0].pointIndex;
                    const point = pointsWithVectors[pointIndex];
                    this.selectPoint(point);
                });
            }).catch(error => {
                console.error('Plotly error:', error);
                this.showMessage(`Plot rendering error: ${error.message}`, 'error');
            });
        } catch (error) {
            console.error('Plotly setup error:', error);
            this.showMessage(`Plot setup error: ${error.message}`, 'error');
        }
    }

    prepareTraces(pointsWithVectors, colorBy, sizeBy) {
        const is3D = this.reducedData[0].length === 3;
        const colorMap = this.createColorMap(pointsWithVectors, colorBy);
        const sizeMap = this.createSizeMap(pointsWithVectors, sizeBy);

        // Ensure we have valid data
        if (!this.reducedData || this.reducedData.length === 0) {
            console.error('No reduced data available');
            return [];
        }

        const trace = {
            x: this.reducedData.map(d => d[0] || 0),
            y: this.reducedData.map(d => d[1] || 0),
            z: is3D ? this.reducedData.map(d => d[2] || 0) : undefined,
            mode: 'markers',
            type: is3D ? 'scatter3d' : 'scatter',
            marker: {
                color: pointsWithVectors.map((_, i) => colorMap[i]),
                size: pointsWithVectors.map((_, i) => sizeMap[i]),
                opacity: 0.7,
                line: {
                    color: 'rgba(0,0,0,0.1)',
                    width: 1
                }
            },
            text: pointsWithVectors.map(p => `ID: ${p.id}<br>pHash: ${p.payload?.phash || 'N/A'}<br>Created: ${p.payload?.created_at || 'N/A'}`),
            hoverinfo: 'text'
        };

        return [trace];
    }

    createColorMap(points, colorBy) {
        const values = points.map(p => {
            switch (colorBy) {
                case 'phash':
                    return p.payload?.phash || 'unknown';
                case 'created_at':
                    return p.payload?.created_at || 'unknown';
                case 'cluster':
                default:
                    // Simple clustering based on pHash prefix
                    const phash = p.payload?.phash || '';
                    return phash.substring(0, 8);
            }
        });

        const uniqueValues = [...new Set(values)];
        const colorScale = Plotly.d3.scale.category10();
        
        return values.map(v => {
            const index = uniqueValues.indexOf(v);
            return colorScale(index);
        });
    }

    createSizeMap(points, sizeBy) {
        switch (sizeBy) {
            case 'similarity':
                // For now, use uniform size since we don't have similarity scores
                return points.map(() => 8);
            case 'uniform':
            default:
                return points.map(() => 8);
        }
    }

    async selectPoint(point) {
        this.selectedPoint = point;
        this.updateStats();
        
        const neighborsCount = parseInt(document.getElementById('neighbors-count').value);
        await this.findNearestNeighbors(point, neighborsCount);
        
        // Highlight the selected point in the plot
        if (this.plot) {
            const pointIndex = this.points.findIndex(p => p.id === point.id);
            if (pointIndex !== -1) {
                Plotly.restyle('plot', {
                    'marker.size': this.points.map((_, i) => i === pointIndex ? 15 : 8)
                });
            }
        }
    }

    async findNearestNeighbors(point, count) {
        if (!point.vector || point.vector.length === 0) {
            this.showMessage('Selected point has no vector data', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    vector: point.vector,
                    limit: count + 1, // +1 to exclude self
                    with_payload: true,
                    with_vector: false
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const neighbors = data.result.filter(n => n.id !== point.id);
            
            this.displayNeighbors(point, neighbors);
            
        } catch (error) {
            console.error('Error finding neighbors:', error);
            this.showMessage(`Error finding neighbors: ${error.message}`, 'error');
        }
    }

    displayNeighbors(selectedPoint, neighbors) {
        const neighborsSection = document.getElementById('neighbors-section');
        const neighborsList = document.getElementById('neighbors-list');
        
        neighborsSection.style.display = 'block';
        neighborsList.innerHTML = '';

        neighbors.forEach(neighbor => {
            const neighborItem = document.createElement('div');
            neighborItem.className = 'neighbor-item';
            
            const imageUrl = neighbor.payload?.key ? 
                `http://localhost:3000/s3/${neighbor.payload.key}` : 
                'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0zMCAzNUw0MCAyNUg0NUwzMCA0MEwxNSAyNUgyMEwzMCAzNVoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
            
            neighborItem.innerHTML = `
                <img src="${imageUrl}" alt="Neighbor" class="neighbor-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0zMCAzNUw0MCAyNUg0NUwzMCA0MEwxNSAyNUgyMEwzMCAzNVoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+'">
                <div class="neighbor-info">
                    <div><strong>ID:</strong> ${neighbor.id}</div>
                    <div><strong>pHash:</strong> ${neighbor.payload?.phash || 'N/A'}</div>
                    <div><strong>Similarity:</strong> <span class="neighbor-score">${(neighbor.score * 100).toFixed(1)}%</span></div>
                </div>
            `;
            
            neighborsList.appendChild(neighborItem);
        });
    }

    clearSelection() {
        this.selectedPoint = null;
        this.updateStats();
        
        document.getElementById('neighbors-section').style.display = 'none';
        
        if (this.plot) {
            Plotly.restyle('plot', {
                'marker.size': this.points.map(() => 8)
            });
        }
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new QdrantVectorExplorer();
});
