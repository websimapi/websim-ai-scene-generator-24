import { sceneState, addAssetToScene, updateAsset, removeAsset, markAsDirty } from './state.js';
import { lastGeneratedAsset, selectLibraryAsset } from './ui.js';
import { updatePropertiesPanel } from './propertiesPanel.js';

let canvas, ctx;
let backgroundImages = [];
const assetImages = {};

const assetTypeColors = {
    'Object': '#E0E0E0',    // Light Grey
    'Portal': '#DA70D6',    // Orchid
    'NPC': '#98FB98',       // Pale Green
    'Item': '#87CEEB',      // Sky Blue
    'Character': '#FFA07A', // Light Salmon
};

let activeTool = 'move'; // 'move', 'add', 'delete'
let selectedAssetId = null;
let isDragging = false;
let dragStartX, dragStartY;

function getScaledPos(e, isTouchEvent = false) {
    const rect = canvas.getBoundingClientRect();
    const touchOrMouseEvent = isTouchEvent ? (e.touches[0] || e.changedTouches[0]) : e;

    // Calculate mouse position relative to the element
    const rawX = touchOrMouseEvent.clientX - rect.left;
    const rawY = touchOrMouseEvent.clientY - rect.top;
    
    // Calculate scaling factors
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Adjust mouse coordinates by the scaling factors
    return {
        x: rawX * scaleX,
        y: rawY * scaleY
    };
}

function getMousePos(e) {
    return getScaledPos(e, false);
}

function getTouchPos(e) {
    return getScaledPos(e, true);
}

function onMouseDown(e) {
    if (activeTool !== 'move') return;

    const pos = getMousePos(e);
    const clickedAsset = getAssetAtPos(pos);

    if (clickedAsset) {
        selectAsset(clickedAsset);
        isDragging = true;
        dragStartX = pos.x - clickedAsset.x;
        dragStartY = pos.y - clickedAsset.y;
    } else {
        selectAsset(null);
    }
}

function onTouchStart(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const pos = getTouchPos(e);
        const clickedAsset = getAssetAtPos(pos);

        if (clickedAsset && activeTool === 'move') {
            selectAsset(clickedAsset);
            isDragging = true;
            dragStartX = pos.x - clickedAsset.x;
            dragStartY = pos.y - clickedAsset.y;
        } else {
            selectAsset(null);
            // This allows tap-to-place on mobile
            if (activeTool === 'add') {
                 onClick(e); // Pass touch event to click handler
            }
        }
    }
}

export function clearAssetImages() {
    // Clear all keys from the assetImages object
    for (const key in assetImages) {
        delete assetImages[key];
    }
    backgroundImages = []; // Also clear background images to force a reload
}

export function initializeCanvas(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);
    
    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    
    document.getElementById('tool-move').addEventListener('click', () => setTool('move'));
    document.getElementById('tool-add').addEventListener('click', () => setTool('add'));
    document.getElementById('tool-delete').addEventListener('click', () => {
        if (selectedAssetId) {
            removeAsset(selectedAssetId);
            delete assetImages[selectedAssetId];
            selectAsset(null);
            redrawCanvas();
        }
    });
}

export function setTool(tool) {
    activeTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tool-${tool}`).classList.add('active');
    
    switch(tool) {
        case 'move':
            canvas.style.cursor = 'default';
            break;
        case 'add':
            canvas.style.cursor = 'crosshair';
            break;
        case 'delete':
            canvas.style.cursor = 'not-allowed';
            break;
    }
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    redrawCanvas();
}

export function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background layers
    if (sceneState.backgrounds.length > 0 && backgroundImages.length !== sceneState.backgrounds.length) {
        backgroundImages = [];
        sceneState.backgrounds.forEach(bgUrl => {
            const img = new Image();
            img.src = bgUrl;
            img.onload = () => redrawCanvas();
            backgroundImages.push(img);
        });
    }

    if (backgroundImages.length > 0) {
        backgroundImages.forEach(bgImg => {
            if (bgImg.complete) {
                ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
            }
        });
    }

    // Draw assets
    sceneState.assets.forEach(asset => {
        if (!assetImages[asset.id]) {
            assetImages[asset.id] = new Image();
            assetImages[asset.id].src = asset.url;
            assetImages[asset.id].onload = () => redrawCanvas();
        }
        const img = assetImages[asset.id];
        if (img && img.complete) {
            ctx.drawImage(img, asset.x, asset.y, asset.width, asset.height);

            // Draw selection box if selected, using the asset type's color
            if (asset.id === selectedAssetId) {
                const color = assetTypeColors[asset.type] || '#007bff'; // Fallback to blue
                ctx.strokeStyle = color;
                ctx.lineWidth = 3; // Thicker for emphasis
                ctx.strokeRect(asset.x, asset.y, asset.width, asset.height);
            }
        }
    });
}

export function getAssetAtPos(pos) {
    // Iterate backwards to select top-most asset
    for (let i = sceneState.assets.length - 1; i >= 0; i--) {
        const asset = sceneState.assets[i];
        if (pos.x >= asset.x && pos.x <= asset.x + asset.width &&
            pos.y >= asset.y && pos.y <= asset.y + asset.height) {
            return asset;
        }
    }
    return null;
}

function selectAsset(asset) {
    selectedAssetId = asset ? asset.id : null;
    updatePropertiesPanel(selectedAssetId);
    redrawCanvas();
}

function onMouseMove(e) {
    if (isDragging && selectedAssetId && activeTool === 'move') {
        const pos = getMousePos(e);
        updateAsset(selectedAssetId, {
            x: pos.x - dragStartX,
            y: pos.y - dragStartY,
        });
        updatePropertiesPanel(selectedAssetId); // Update coords in panel
        redrawCanvas();
    }
}

function onTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        if (isDragging && selectedAssetId && activeTool === 'move') {
            const pos = getTouchPos(e);
            updateAsset(selectedAssetId, {
                x: pos.x - dragStartX,
                y: pos.y - dragStartY,
            });
            updatePropertiesPanel(selectedAssetId);
            redrawCanvas();
        }
    }
}

function onMouseUp(e) {
    if (isDragging) {
        markAsDirty();
    }
    isDragging = false;
}

function onTouchEnd(e) {
    if (isDragging) {
        markAsDirty();
    }
    isDragging = false;
}

function onDragOver(e) {
    e.preventDefault(); // Allow dropping
}

function onDrop(e) {
    e.preventDefault();
    const assetDataString = e.dataTransfer.getData('application/json');
    if (!assetDataString) return;

    try {
        const assetData = JSON.parse(assetDataString);
        
        // Don't allow dropping backgrounds into the scene as objects
        if (assetData.type === 'Background') {
            // Find the library item and select it to show properties
             const libraryItem = document.querySelector(`.library-asset[data-asset-url="${assetData.url}"]`);
            if (libraryItem) {
                selectLibraryAsset(libraryItem);
            }
            alert("Backgrounds can't be placed as objects. Select it in the library to set it as the scene background.");
            return;
        }

        const pos = getMousePos(e);

        const newAsset = {
            ...assetData,
            id: `asset_${Date.now()}`,
            x: pos.x - 50, // center on cursor
            y: pos.y - 50,
            width: 100,
            height: 100,
            name: `${assetData.type} - ${assetData.prompt.substring(0, 15)}...`
        };
        addAssetToScene(newAsset);
        selectAsset(newAsset);
        redrawCanvas();
    } catch (error) {
        console.error("Failed to handle drop event:", error);
    }
}

function onClick(e) {
    // For touch, the position needs to be derived from the touch event if it exists
    const pos = e.touches ? getTouchPos(e) : getMousePos(e);

    // Click-to-select is now handled by onMouseDown, so we can avoid re-selecting here
    // which might interfere with drag initiation. We only handle adding assets here.
    if (activeTool === 'add') {
        const selectedLibraryAsset = document.querySelector('.library-asset.selected');
        if (!selectedLibraryAsset) {
            alert('Please generate an asset first or select one from the library.');
            return;
        }

        const assetData = {
            url: selectedLibraryAsset.dataset.assetUrl,
            type: selectedLibraryAsset.dataset.assetType,
            prompt: selectedLibraryAsset.dataset.assetPrompt,
        };

        if (assetData.type === 'Background') {
             alert("Backgrounds can't be placed as objects. Select it in the library to set it as the scene background.");
            return;
        }

        const newAsset = {
            ...assetData,
            id: `asset_${Date.now()}`,
            x: pos.x - 50, // center it
            y: pos.y - 50,
            width: 100,
            height: 100,
            name: `${assetData.type} - ${assetData.prompt.substring(0, 15)}...`
        };
        addAssetToScene(newAsset);
        selectAsset(newAsset);
        redrawCanvas();
    }
}

export function getSelectedAsset() {
    return sceneState.assets.find(a => a.id === selectedAssetId);
}