class WardleyComponent extends HTMLElement {
    connectedCallback() {
        // Set default values for attributes if not provided
        if (!this.hasAttribute('evolution')) {
            this.setAttribute('evolution', 'custom');
        }
        if (!this.hasAttribute('name')) {
            this.setAttribute('name', 'Unnamed');
        }
    }

    get dependencies() {
        return this.querySelectorAll('wardley-dependency');
    }
}

class WardleyDependency extends HTMLElement {
    connectedCallback() {
    }

    get source() {
        return this.parentElement;
    }

    get target() {
        const targetSelector = this.getAttribute('target');
        return this.closest('wardley-map').querySelector( `#${targetSelector}` );
    }
}


// Where each evolution stage sits on the x-axis.
const STAGE_POSITIONS = {
    'genesis': 100,
    'custom': 300,
    'product': 500,
    'commodity': 700
};

// Components that share a stage are fanned out across it (offsets in px from
// the stage centre) so that dependencies between them don't run straight down
// the stage, through every other component on the way.
const STAGE_SPREAD = [0, 30, -30, 15, -15, 45, -45];

// How far (px) a component may sit from its stage's centre before it would
// be misread as belonging to the neighbouring stage.
const MAX_STAGE_OFFSET = 70;

class WardleyMap extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // Initialize MutationObserver
        this.observer = new MutationObserver(() => this.render());

        // Track if the render method has been called before
        this.hasRendered = false;
    }

    connectedCallback() {
        this.render();

        // Start observing changes to the wardley-map element
        this.observer.observe(this, { childList: true, attributes: true, subtree: true });
    }

    disconnectedCallback() {
        // Disconnect the observer when the element is removed from the DOM
        this.observer.disconnect();
    }

    // The components and the dependencies between them, as a graph.
    buildGraph() {
        const components = Array.from(this.querySelectorAll('wardley-component'));
        const nodes = components.map((element, index) => ({
            element, index, dependencies: [], dependents: []
        }));
        const byElement = new Map(nodes.map(node => [node.element, node]));
        const byId = new Map();
        nodes.forEach(node => {
            if (node.element.id && !byId.has(node.element.id)) byId.set(node.element.id, node);
        });

        const edges = [];
        this.querySelectorAll('wardley-dependency').forEach(dependency => {
            const source = byElement.get(dependency.parentElement);
            const target = byId.get(dependency.getAttribute('target'));
            if (source && target && source !== target) {
                source.dependencies.push(target);
                target.dependents.push(source);
                edges.push({ dependency, source, target });
            }
        });
        return { nodes, edges };
    }

    restackComponents() {
        // Check if the observer is already disconnected
        if (this.observer) {
            this.observer.disconnect();
        }

        // Stable topological sort: every component comes after the components
        // that depend on it, and otherwise stays in its current document order.
        // Being stable, restacking an already-restacked map leaves it unchanged,
        // so the layout doesn't shuffle each time the map re-renders.
        const { nodes } = this.buildGraph();
        const waitingOn = new Map(nodes.map(node => [node, node.dependents.length]));
        const placed = new Set();
        const order = [];
        while (order.length < nodes.length) {
            const remaining = nodes.filter(node => !placed.has(node));
            // If there's a dependency cycle nothing is free; break it in document order.
            const next = remaining.find(node => waitingOn.get(node) === 0) || remaining[0];
            placed.add(next);
            order.push(next);
            next.dependencies.forEach(target => waitingOn.set(target, waitingOn.get(target) - 1));
        }

        // Re-arrange components in the DOM based on the sorted order
        order.forEach(node => this.appendChild(node.element));

        // Resume the observer after restacking
        if (this.observer) {
            this.observer.observe(this, { childList: true, attributes: true, subtree: true });
        }
    }

    render() {
        console.log(`rendering wardley map`);

        // Re-arrange components before rendering
        this.restackComponents();

        const { nodes, edges } = this.buildGraph();
        const svgNS = 'http://www.w3.org/2000/svg';

        // Layout constants. The axes are only the *minimum* extent of the graph:
        // once the content has been laid out and measured, the axes are stretched
        // to enclose it, so nothing is ever drawn off the graph.
        const minWidth = 800;     // minimum canvas width
        const leftAxis = 50;      // default x position of the value-chain (y) axis
        const rightEdge = 750;    // default x position of the right end of the evolution axis
        const yTop = 40;          // where the first row of components starts
        const plotPadding = 12;   // clear space between the plotted content and the axes
        const canvasMargin = 10;  // clear space around everything at the canvas edge
        const fontSize = 12;      // component label size
        const lineHeight = 14;    // spacing of wrapped label lines
        const maxLabelChars = 28; // wrap component labels longer than this
        const rowPadding = 14;    // vertical space between rows of components
        const layerGap = 12;      // extra space between levels of the value chain
        const labelGap = 5;       // space between a component and its label

        // Rebuild the shadow DOM from scratch each render.
        this.shadowRoot.innerHTML = '';

        const style = document.createElement('style');
        style.textContent = `
            svg {
                color: inherit;
            }
            text {
                font-family: var(--wardley-component-font-family, inherit); /* Use CSS variable or inherit */
                fill: currentColor;
            }
            /* A background-coloured outline so lines passing behind text don't
               strike through it. */
            text.halo {
                paint-order: stroke;
                stroke: var(--wardley-map-background, white);
                stroke-width: 4px;
                stroke-linejoin: round;
            }
            .axis-label {
                font-weight: 600;
            }
            .stage-label, .visibility-label {
                opacity: 0.75;
            }
        `;
        this.shadowRoot.appendChild(style);

        // The components and dependencies are light-DOM children of the map.
        // Unless they're slotted somewhere, Chrome treats them as outside the
        // rendered tree and getComputedStyle() returns nothing for them, so
        // the page's CSS (colours, fonts, sizes) would be ignored. Slot them
        // into a hidden container so their styles are computed.
        const slotHolder = document.createElement('div');
        slotHolder.hidden = true;
        slotHolder.appendChild(document.createElement('slot'));
        this.shadowRoot.appendChild(slotHolder);

        const svg = document.createElementNS(svgNS, 'svg');
        this.shadowRoot.appendChild(svg);

        // Paint order: frame, then dependency lines, then components, then
        // labels on top of everything so they're always readable.
        const frameGroup = document.createElementNS(svgNS, 'g');
        const edgeGroup = document.createElementNS(svgNS, 'g');
        const nodeGroup = document.createElementNS(svgNS, 'g');
        const labelGroup = document.createElementNS(svgNS, 'g');
        svg.append(frameGroup, edgeGroup, nodeGroup, labelGroup);

        // --- Measure each component: its stage, size and (wrapped) label. ---
        nodes.forEach(node => {
            const computed = getComputedStyle(node.element);
            const evolution = node.element.getAttribute('evolution') || 'custom';
            node.stage = evolution in STAGE_POSITIONS ? evolution : 'custom';

            // Dynamically set radius based on width/height from CSS
            const boxWidth = parseFloat(computed.width) || 14;
            const boxHeight = parseFloat(computed.height) || 14;
            node.radius = Math.min(boxWidth, boxHeight) / 2;
            node.stroke = computed.borderColor || 'black';
            node.fill = computed.color || 'white';

            const label = document.createElementNS(svgNS, 'text');
            label.classList.add('graph-element', 'halo');
            label.setAttribute('font-size', fontSize);
            label.style.fontFamily = computed.fontFamily; // Apply font-family from CSS
            wrapWords(node.element.getAttribute('name') || 'Unnamed', maxLabelChars).forEach((line, i) => {
                const tspan = document.createElementNS(svgNS, 'tspan');
                tspan.setAttribute('dy', i === 0 ? 0 : lineHeight);
                tspan.textContent = line;
                label.appendChild(tspan);
            });
            labelGroup.appendChild(label);
            node.label = label;
            node.labelLines = label.childNodes.length;
            node.labelWidth = textWidth(label);
        });

        // --- Vertical layout: the value chain. ---
        // Each component's level is the length of the longest chain of
        // dependents above it, so everything sits below whatever needs it, as
        // high up (as visible) as it can be.
        const levels = new Map();
        const visiting = new Set();
        const levelOf = (node) => {
            if (levels.has(node)) return levels.get(node);
            if (visiting.has(node)) return 0; // dependency cycle: break it here
            visiting.add(node);
            const level = Math.max(0, ...node.dependents.map(parent => levelOf(parent) + 1));
            visiting.delete(node);
            levels.set(node, level);
            return level;
        };
        const layers = [];
        nodes.forEach(node => {
            const level = levelOf(node);
            (layers[level] = layers[level] || []).push(node);
        });

        // Order each level by the average position of the components that
        // depend on it, so components sit near their dependents and lines stay
        // short and uncrossed. The top level keeps document order.
        let position = 0;
        const orderedLayers = layers.filter(Boolean).map(layer => {
            layer.forEach(node => {
                const placedParents = node.dependents.filter(parent => parent.order !== undefined);
                node.sortKey = placedParents.length
                    ? placedParents.reduce((sum, parent) => sum + parent.order, 0) / placedParents.length
                    : node.index;
            });
            layer.sort((a, b) => (a.sortKey - b.sortKey) || (a.index - b.index));
            layer.forEach(node => { node.order = position++; });
            return layer;
        });

        // --- Horizontal layout: evolution, fanned out within each stage. ---
        const stageCounts = {};
        orderedLayers.flat().forEach(node => {
            const count = stageCounts[node.stage] = (stageCounts[node.stage] || 0) + 1;
            node.x = STAGE_POSITIONS[node.stage] + STAGE_SPREAD[(count - 1) % STAGE_SPREAD.length];
        });

        // --- Pack each level into rows. ---
        // Components on the same level share a row when they (and their labels)
        // fit side by side, which keeps the map compact without overlaps.
        let cursor = yTop;
        orderedLayers.forEach((layer, layerIndex) => {
            const rows = [];
            layer.forEach(node => {
                const span = [node.x - node.radius - 10, node.x + node.radius + labelGap + node.labelWidth + 10];
                let row = rows.find(r => r.every(({ span: [left, right] }) => span[1] <= left || span[0] >= right));
                if (!row) rows.push(row = []);
                node.rowEntry = { node, span, row };
                row.push(node.rowEntry);
            });
            if (layerIndex > 0) cursor += layerGap;
            rows.forEach(row => {
                const textHeight = Math.max(...row.map(({ node }) => node.labelLines)) * lineHeight;
                const circleHeight = Math.max(...row.map(({ node }) => node.radius * 2));
                const height = Math.max(textHeight, circleHeight) + rowPadding;
                row.forEach(({ node }) => { node.y = cursor + (height / 2); });
                cursor += height;
            });
        });

        // --- Keep dependency lines from passing behind unrelated components. ---
        // A line running underneath a component looks like a dependency it
        // doesn't have (e.g. A→C hiding behind A→B→C when the three line up),
        // so nudge such components sideways until the line clears them —
        // staying within their stage, and only where their row has room.
        for (let pass = 0; pass < 4; pass++) {
            let moved = false;
            nodes.forEach(node => {
                edges.forEach(({ source, target }) => {
                    if (source === node || target === node) return;
                    const entry = node.rowEntry;
                    const fits = (dx) => {
                        if (Math.abs(node.x + dx - STAGE_POSITIONS[node.stage]) > MAX_STAGE_OFFSET) return false;
                        return entry.row.every(other => other === entry
                            || entry.span[1] + dx <= other.span[0] || entry.span[0] + dx >= other.span[1]);
                    };
                    // Prefer the smaller move; fall back to the other side of the line.
                    const dx = nudgeOffLine(node, source, target, node.radius + 4)
                        .sort((a, b) => Math.abs(a) - Math.abs(b))
                        .find(fits);
                    if (!dx) return;
                    node.x += dx;
                    entry.span = [entry.span[0] + dx, entry.span[1] + dx];
                    moved = true;
                });
            });
            if (!moved) break;
        }

        // --- Draw. ---
        // Bounds of everything plotted on the graph, used to size the axes.
        const content = new Bounds();

        edges.forEach(({ dependency, source, target }) => {
            const line = document.createElementNS(svgNS, 'line');
            line.classList.add('graph-element');
            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);

            // Apply color from CSS
            const dependencyColor = getComputedStyle(dependency).color || 'black';
            line.setAttribute('stroke', dependencyColor);
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-linecap', 'round');
            edgeGroup.appendChild(line);

            // Add label for the dependency if it exists
            const labelElement = dependency.querySelector('label');
            if (labelElement) {
                const label = document.createElementNS(svgNS, 'text');
                label.classList.add('graph-element', 'halo');
                label.setAttribute('x', (source.x + target.x) / 2); // Midpoint of the line
                label.setAttribute('y', (source.y + target.y) / 2 - 5); // Slightly above the line
                label.setAttribute('font-size', '10');
                label.setAttribute('text-anchor', 'middle');
                label.textContent = labelElement.textContent || '';
                labelGroup.appendChild(label);
                content.add(textBounds(label));
            }
        });

        nodes.forEach(node => {
            const circle = document.createElementNS(svgNS, 'circle');
            circle.classList.add('graph-element');
            if (node.element.id) circle.setAttribute('id', node.element.id);
            circle.setAttribute('cx', node.x);
            circle.setAttribute('cy', node.y);
            circle.setAttribute('r', node.radius);
            circle.setAttribute('stroke', node.stroke);
            circle.setAttribute('stroke-width', '1.5');
            circle.setAttribute('fill', node.fill);
            nodeGroup.appendChild(circle);
            const halfStroke = 0.75;
            content.add({
                left: node.x - node.radius - halfStroke, right: node.x + node.radius + halfStroke,
                top: node.y - node.radius - halfStroke, bottom: node.y + node.radius + halfStroke
            });

            // Label to the right of the component, vertically centred on it.
            const labelX = node.x + node.radius + labelGap;
            const firstBaseline = node.y - ((node.labelLines - 1) * lineHeight / 2) + (fontSize * 0.35);
            node.label.setAttribute('x', labelX);
            node.label.setAttribute('y', firstBaseline);
            node.label.querySelectorAll('tspan').forEach(tspan => tspan.setAttribute('x', labelX));
            content.add(textBounds(node.label));
        });

        // --- Frame: fit the axes around the content. ---
        // The axes start at their default positions and are pushed outwards
        // wherever something would otherwise land outside them. (Dependency
        // lines run between component centres, so they're always inside.)
        const frameText = (text, className, fontSizeAttr = 11) => {
            const element = document.createElementNS(svgNS, 'text');
            element.setAttribute('font-size', fontSizeAttr);
            element.classList.add(className);
            element.textContent = text;
            frameGroup.appendChild(element);
            return element;
        };
        const visibleLabel = frameText('Visible', 'visibility-label');
        const valueChainLabel = frameText('Value Chain', 'axis-label', 12);
        const invisibleLabel = frameText('Invisible', 'visibility-label');

        const plotLeft = Math.min(leftAxis, content.left - plotPadding);
        const plotRight = Math.max(rightEdge, content.right + plotPadding);
        const plotTop = Math.min(yTop - 15, content.top - plotPadding);
        // The value-chain axis must be long enough for its three labels.
        const yLabelsLength = textWidth(visibleLabel) + textWidth(valueChainLabel) + textWidth(invisibleLabel) + 40;
        const axisY = Math.max(content.bottom + plotPadding, plotTop + yLabelsLength);

        const everything = new Bounds().add(content);

        // Stage dividers and labels
        const stagePositions = Object.values(STAGE_POSITIONS);
        for (let i = 1; i < stagePositions.length; i++) {
            const dividerX = (stagePositions[i - 1] + stagePositions[i]) / 2;
            const divider = document.createElementNS(svgNS, 'line');
            divider.setAttribute('x1', dividerX);
            divider.setAttribute('y1', axisY);
            divider.setAttribute('x2', dividerX);
            divider.setAttribute('y2', plotTop);
            divider.setAttribute('stroke', 'currentColor');
            divider.setAttribute('stroke-opacity', '0.25');
            divider.setAttribute('stroke-width', '1');
            divider.setAttribute('stroke-dasharray', '4,4'); // Dashed line
            frameGroup.appendChild(divider);
        }
        Object.entries(STAGE_POSITIONS).forEach(([stage, x]) => {
            const label = frameText(stage.charAt(0).toUpperCase() + stage.slice(1), 'stage-label');
            label.setAttribute('x', x);
            label.setAttribute('y', axisY + 18);
            label.setAttribute('text-anchor', 'middle');
            everything.add(textBounds(label));
        });

        // Axes, each with an arrowhead pointing the way it increases
        const axis = (x1, y1, x2, y2, arrow) => {
            const line = document.createElementNS(svgNS, 'line');
            line.classList.add('axis');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'currentColor');
            line.setAttribute('stroke-width', '1.5');
            frameGroup.appendChild(line);
            const head = document.createElementNS(svgNS, 'polygon');
            head.setAttribute('points', arrow.map(point => point.join(',')).join(' '));
            head.setAttribute('fill', 'currentColor');
            frameGroup.appendChild(head);
            arrow.forEach(([x, y]) => everything.add({ left: x, right: x, top: y, bottom: y }));
        };
        axis(plotLeft, axisY, plotRight, axisY,
            [[plotRight + 8, axisY], [plotRight, axisY - 4], [plotRight, axisY + 4]]);
        axis(plotLeft, axisY, plotLeft, plotTop,
            [[plotLeft, plotTop - 8], [plotLeft - 4, plotTop], [plotLeft + 4, plotTop]]);

        const evolutionLabel = frameText('Evolution', 'axis-label', 12);
        evolutionLabel.setAttribute('x', plotRight + 8);
        evolutionLabel.setAttribute('y', axisY + 36);
        evolutionLabel.setAttribute('text-anchor', 'end');
        everything.add(textBounds(evolutionLabel));

        // Value-chain labels run up the y-axis: Visible at the top, Invisible
        // at the bottom, and the axis name in the middle.
        const yLabelX = plotLeft - 14;
        const placeRotated = (label, y, anchor) => {
            label.setAttribute('x', yLabelX);
            label.setAttribute('y', y);
            label.setAttribute('text-anchor', anchor);
            label.setAttribute('transform', `rotate(-90, ${yLabelX}, ${y})`);
            everything.add(rotatedBounds(label, yLabelX, y));
        };
        placeRotated(visibleLabel, plotTop, 'end');
        placeRotated(valueChainLabel, (plotTop + axisY) / 2, 'middle');
        placeRotated(invisibleLabel, axisY, 'start');

        // --- Size the canvas to everything that was drawn. ---
        // The viewBox origin may be negative if the graph had to grow leftwards
        // or upwards, which keeps the evolution stages at stable coordinates.
        const viewLeft = Math.floor(Math.min(0, everything.left - canvasMargin));
        const viewTop = Math.floor(Math.min(0, everything.top - canvasMargin));
        const viewRight = Math.ceil(Math.max(minWidth, everything.right + canvasMargin));
        const viewBottom = Math.ceil(everything.bottom + canvasMargin);
        const finalWidth = viewRight - viewLeft;
        const height = viewBottom - viewTop;
        svg.setAttribute('width', finalWidth);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `${viewLeft} ${viewTop} ${finalWidth} ${height}`);
        // Scale down to the container on narrow / mobile screens (the viewBox keeps
        // the aspect ratio); cap at the natural width so it never blows up on desktop.
        svg.setAttribute('style', `border: 1px solid #d0d5dd; border-radius: 6px; background: var(--wardley-map-background, white); width: 100%; height: auto; max-width: ${finalWidth}px;`);

        // Dispatch a non-bubbling "change" event only on subsequent renderings
        if (this.hasRendered) {
            const changeEvent = new Event('change', { bubbles: false });
            this.dispatchEvent(changeEvent);
        }

        // Mark as rendered
        this.hasRendered = true;
    }
}

// An axis-aligned bounding box that grows to include whatever is added to it.
class Bounds {
    constructor() {
        this.left = Infinity;
        this.top = Infinity;
        this.right = -Infinity;
        this.bottom = -Infinity;
    }

    add({ left, top, right, bottom }) {
        this.left = Math.min(this.left, left);
        this.top = Math.min(this.top, top);
        this.right = Math.max(this.right, right);
        this.bottom = Math.max(this.bottom, bottom);
        return this;
    }
}

// The sideways moves (one each side of the line) that would make the line
// segment from a to b clear the point by at least `clearance`. Empty if it
// already does, or if the line is too close to horizontal for a sideways move
// to help.
function nudgeOffLine(point, a, b, clearance) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) return [];
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    // Only the stretch between the two ends matters.
    const along = ((point.x - a.x) * ux) + ((point.y - a.y) * uy);
    if (along <= 0 || along >= length) return [];
    // Signed perpendicular distance from the line, along the normal (-uy, ux).
    const across = ((point.x - a.x) * -uy) + ((point.y - a.y) * ux);
    if (Math.abs(across) >= clearance || Math.abs(uy) < 0.1) return [];
    // Moving x by dx changes `across` by dx * -uy.
    return [clearance + 1, -(clearance + 1)].map(wanted => (wanted - across) / -uy);
}

// Split text into lines of at most maxChars, breaking between words.
function wrapWords(text, maxChars) {
    const lines = [];
    let line = '';
    text.split(/\s+/).filter(Boolean).forEach(word => {
        if (line && (line.length + 1 + word.length) > maxChars) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

// Width of an SVG text element: its widest line if it's split into tspans.
// The text must already be in the SVG so it can be measured; if it can't be
// (e.g. the map is hidden) the width is estimated from the character count.
function textWidth(text) {
    const fontSize = parseFloat(text.getAttribute('font-size')) || 12;
    const tspans = text.querySelectorAll('tspan');
    const lines = tspans.length ? Array.from(tspans) : [text];
    return Math.max(0, ...lines.map(line => {
        let width = 0;
        try {
            width = line.getComputedTextLength();
        } catch (e) {
            width = 0;
        }
        return width || (line.textContent || '').length * fontSize * 0.6;
    }));
}

// Bounding box of an (unrotated) SVG text element, from its position, anchor,
// font size and any extra lines.
function textBounds(text) {
    const x = parseFloat(text.getAttribute('x')) || 0;
    const y = parseFloat(text.getAttribute('y')) || 0;
    const fontSize = parseFloat(text.getAttribute('font-size')) || 12;
    const width = textWidth(text);
    const extraLines = Array.from(text.querySelectorAll('tspan'))
        .reduce((sum, tspan) => sum + (parseFloat(tspan.getAttribute('dy')) || 0), 0);
    const anchor = text.getAttribute('text-anchor');
    const left = anchor === 'middle' ? x - (width / 2)
               : anchor === 'end' ? x - width
               : x;
    // y is the first baseline: allow for ascenders above it and descenders below the last.
    return { left, right: left + width, top: y - fontSize, bottom: y + extraLines + (fontSize * 0.3) };
}

// Bounding box of a text element rotated -90° about (cx, cy): an offset
// (dx, dy) from that point ends up at (dy, -dx).
function rotatedBounds(text, cx, cy) {
    const { left, right, top, bottom } = textBounds(text);
    return {
        left: cx + (top - cy),
        right: cx + (bottom - cy),
        top: cy - (right - cx),
        bottom: cy - (left - cx)
    };
}

customElements.define('wardley-map', WardleyMap);
customElements.define('wardley-component', WardleyComponent);
customElements.define('wardley-dependency', WardleyDependency);
