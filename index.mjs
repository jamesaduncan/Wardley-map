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

    *nextStep( stepSize ) {
        let step = 0;
        const steps = [ 0.25, 0.5, 0.75 ];
        while (true) {
            yield stepSize + (steps[ step ] * stepSize);
            step++;
            if (step >= steps.length) {
                step = 0;
            }
        }
    }

    restackComponents() {
        const components = Array.from(this.querySelectorAll('wardley-component'));
        const dependencies = Array.from(this.querySelectorAll('wardley-dependency'));

        // Check if the observer is already disconnected
        if (this.observer) {
            this.observer.disconnect();
        }

        // Create a map of dependencies
        const dependencyMap = new Map();
        components.forEach(component => {
            dependencyMap.set(component.id, []);
        });

        dependencies.forEach(dependency => {
            const sourceId = dependency.parentElement.id;
            const targetId = dependency.getAttribute('target');
            if (dependencyMap.has(sourceId)) {
                dependencyMap.get(sourceId).push(targetId);
            }
        });

        // Perform a topological sort to determine stacking order
        const visited = new Set();
        const stack = [];

        const visit = (componentId) => {
            if (!visited.has(componentId)) {
                visited.add(componentId);
                (dependencyMap.get(componentId) || []).forEach(visit);
                stack.push(componentId);
            }
        };

        components.forEach(component => visit(component.id));

        // Re-arrange components in the DOM based on the sorted order
        stack.reverse().forEach(componentId => {
            const component = this.querySelector(`#${componentId}`);
            if (component) {
                this.appendChild(component);
            }
        });

        // Resume the observer after restacking
        if (this.observer) {
            this.observer.observe(this, { childList: true, attributes: true, subtree: true });
        }
    }

    render() {
        console.log(`rendering wardley map`);

        // Re-arrange components before rendering
        this.restackComponents();

        const components = Array.from(this.querySelectorAll('wardley-component'));
        const dependencies = Array.from(this.querySelectorAll('wardley-dependency'));

        const svgNS = 'http://www.w3.org/2000/svg';

        // Layout constants
        const width = 800;
        const leftAxis = 50;   // x position of the value-chain (y) axis
        const rightEdge = 750; // x position of the right end of the evolution axis
        const yTop = 50;       // padding above the first component
        const yStep = 50;      // vertical distance per component — the map grows with the count

        // Map evolution to x-axis positions
        const evolutionPositions = {
            'genesis': 100,
            'custom': 300,
            'product': 500,
            'commodity': 700
        };

        // Vertical position of each component. A predictable, varying step keeps
        // dependency lines from overlapping (see nextStep), and because the step
        // is fixed the drawing grows to fit however many components there are.
        const stepGenerator = this.nextStep(yStep);
        const ySteps = components.map((e, i) => (yStep * i) + stepGenerator.next().value);

        // Place the evolution (x) axis just below the lowest component, then size
        // the canvas to contain it plus room for the axis labels beneath it. This
        // is what makes the map expand vertically to fit large numbers of items.
        const lowestComponentY = ySteps.length ? Math.max(...ySteps) : yTop;
        const axisY = lowestComponentY + 40;
        const height = axisY + 50;

        // Rebuild the SVG from scratch each render so the axes track the dynamic height.
        this.shadowRoot.innerHTML = '';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('style', 'border: 1px solid black;');
        this.shadowRoot.appendChild(svg);

        // Add a style element to inherit global styles
        const style = document.createElement('style');
        style.textContent = `
            text {
                font-family: var(--wardley-component-font-family, inherit); /* Use CSS variable or inherit */
            }
        `;
        this.shadowRoot.appendChild(style);

        // Draw axes
        const xAxis = document.createElementNS(svgNS, 'line');
        xAxis.setAttribute('x1', leftAxis);
        xAxis.setAttribute('y1', axisY);
        xAxis.setAttribute('x2', rightEdge);
        xAxis.setAttribute('y2', axisY);
        xAxis.setAttribute('stroke', 'black');
        xAxis.setAttribute('stroke-width', '2');
        svg.appendChild(xAxis);

        const yAxis = document.createElementNS(svgNS, 'line');
        yAxis.setAttribute('x1', leftAxis);
        yAxis.setAttribute('y1', axisY);
        yAxis.setAttribute('x2', leftAxis);
        yAxis.setAttribute('y2', yTop - 20);
        yAxis.setAttribute('stroke', 'black');
        yAxis.setAttribute('stroke-width', '2');
        svg.appendChild(yAxis);

        // Add axis labels
        const xLabel = document.createElementNS(svgNS, 'text');
        xLabel.setAttribute('x', width / 2);
        xLabel.setAttribute('y', axisY + 30); // Below the X-axis
        xLabel.setAttribute('font-size', '12');
        xLabel.textContent = 'Evolution';
        svg.appendChild(xLabel);

        const yLabel = document.createElementNS(svgNS, 'text');
        yLabel.setAttribute('x', -300);
        yLabel.setAttribute('y', '40');
        yLabel.setAttribute('font-size', '12');
        yLabel.setAttribute('transform', 'rotate(-90, 20, 40)');
        yLabel.textContent = 'Value Chain';
        svg.appendChild(yLabel);

        // Add X-axis labels
        Object.entries(evolutionPositions).forEach(([label, position]) => {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', position);
            text.setAttribute('y', axisY + 15);
            text.setAttribute('font-size', '12');
            text.setAttribute('text-anchor', 'middle');
            text.textContent = label.charAt(0).toUpperCase() + label.slice(1);
            svg.appendChild(text);
        });

        // Draw dashed lines between evolution stages
        const evolutionStages = Object.values(evolutionPositions);
        for (let i = 1; i < evolutionStages.length; i++) {
            const dashedLine = document.createElementNS(svgNS, 'line');
            const dashedX = (evolutionStages[i - 1] + evolutionStages[i]) / 2;
            dashedLine.setAttribute('x1', dashedX);
            dashedLine.setAttribute('y1', axisY);
            dashedLine.setAttribute('x2', dashedX);
            dashedLine.setAttribute('y2', yTop - 20);
            dashedLine.setAttribute('stroke', 'gray');
            dashedLine.setAttribute('stroke-width', '1');
            dashedLine.setAttribute('stroke-dasharray', '5,5'); // Dashed line
            svg.appendChild(dashedLine);
        }

        // Draw dependencies first
        dependencies.forEach(dependency => {
            const sourceId = dependency.parentElement.id;
            const targetId = dependency.getAttribute('target');
            const source = components.find(c => c.id === sourceId);
            const target = components.find(c => c.id === targetId);

            if (source && target) {
                const sourceCx = evolutionPositions[source.getAttribute('evolution')] || 300;
                const sourceCy = ySteps[components.indexOf(source)];
                const targetCx = evolutionPositions[target.getAttribute('evolution')] || 300;
                const targetCy = ySteps[components.indexOf(target)];

                const line = document.createElementNS(svgNS, 'line');
                line.classList.add('graph-element');
                line.setAttribute('x1', sourceCx);
                line.setAttribute('y1', sourceCy);
                line.setAttribute('x2', targetCx);
                line.setAttribute('y2', targetCy);

                // Apply color from CSS
                const dependencyColor = getComputedStyle(dependency).color || 'black';
                line.setAttribute('stroke', dependencyColor);
                line.setAttribute('stroke-width', '1');
                svg.appendChild(line);

                // Add label for the dependency if it exists
                const labelElement = dependency.querySelector('label');
                if (labelElement) {
                    const labelText = labelElement.textContent || '';
                    const label = document.createElementNS(svgNS, 'text');
                    label.classList.add('graph-element');
                    label.setAttribute('x', (sourceCx + targetCx) / 2); // Midpoint of the line
                    label.setAttribute('y', (sourceCy + targetCy) / 2 - 5); // Slightly above the line
                    label.setAttribute('font-size', '10');
                    label.setAttribute('text-anchor', 'middle');
                    label.textContent = labelText;
                    svg.appendChild(label);
                }
            }
        });

        // Draw components on top of dependencies
        components.forEach((component, index) => {
            const evolution = component.getAttribute('evolution') || 'custom';
            const cx = evolutionPositions[evolution] || 300;
            const cy = ySteps[index]; // Use nextStep-generated yStep for positioning

            const circle = document.createElementNS(svgNS, 'circle');
            circle.classList.add('graph-element');
            circle.setAttribute('id', component.id);
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);

            // Dynamically set radius based on width/height from CSS
            const boxWidth = parseFloat(getComputedStyle(component).width) || 20;
            const boxHeight = parseFloat(getComputedStyle(component).height) || 20;
            const radius = Math.min(boxWidth, boxHeight) / 2;
            circle.setAttribute('r', radius);

            // Apply border and color from CSS
            const borderColor = getComputedStyle(component).borderColor || 'black';
            const fillColor = getComputedStyle(component).color || 'blue';
            circle.setAttribute('stroke', borderColor);
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('fill', fillColor);
            svg.appendChild(circle);

            const text = document.createElementNS(svgNS, 'text');
            text.classList.add('graph-element');
            text.setAttribute('x', cx + radius + 5); // Adjust label position based on radius
            text.setAttribute('y', cy + 5);
            text.setAttribute('font-size', '12');
            text.textContent = component.getAttribute('name') || 'Unnamed';
            text.style.fontFamily = getComputedStyle(component).fontFamily; // Apply font-family from CSS
            svg.appendChild(text);
        });

        // Expand the canvas width to fit the longest component label, then add a
        // viewBox so the whole map scales to the container width. Without this the
        // right-hand (commodity) labels are clipped on narrow / mobile screens.
        let maxRight = width;
        svg.querySelectorAll('text').forEach(label => {
            const x = parseFloat(label.getAttribute('x')) || 0;
            let textWidth;
            try {
                textWidth = label.getComputedTextLength();
            } catch (e) {
                textWidth = 0;
            }
            if (!textWidth) {
                const fontSize = parseFloat(label.getAttribute('font-size')) || 12;
                textWidth = (label.textContent || '').length * fontSize * 0.6;
            }
            // Account for the text-anchor when working out the right-most edge.
            const anchor = label.getAttribute('text-anchor');
            const right = anchor === 'middle' ? x + (textWidth / 2)
                        : anchor === 'end' ? x
                        : x + textWidth;
            maxRight = Math.max(maxRight, right);
        });
        const finalWidth = Math.ceil(maxRight + 10);
        svg.setAttribute('width', finalWidth);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', `0 0 ${finalWidth} ${height}`);
        // Scale down to the container on narrow / mobile screens (the viewBox keeps
        // the aspect ratio); cap at the natural width so it never blows up on desktop.
        svg.setAttribute('style', `border: 1px solid black; width: 100%; height: auto; max-width: ${finalWidth}px;`);

        // Dispatch a non-bubbling "change" event only on subsequent renderings
        if (this.hasRendered) {
            const changeEvent = new Event('change', { bubbles: false });
            this.dispatchEvent(changeEvent);
        }

        // Mark as rendered
        this.hasRendered = true;
    }
}

customElements.define('wardley-map', WardleyMap);
customElements.define('wardley-component', WardleyComponent);
customElements.define('wardley-dependency', WardleyDependency);
