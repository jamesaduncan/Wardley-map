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
        // Re-arrange components before rendering
        this.restackComponents();

        const components = Array.from(this.querySelectorAll('wardley-component'));
        const dependencies = Array.from(this.querySelectorAll('wardley-dependency'));

        const svgNS = 'http://www.w3.org/2000/svg';

        // Check if SVG already exists, otherwise create it
        let svg = this.shadowRoot.querySelector('svg');
        if (!svg) {
            svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('width', '800');
            svg.setAttribute('height', '600');
            svg.setAttribute('style', 'border: 1px solid black;');
            this.shadowRoot.innerHTML = '';
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
            xAxis.setAttribute('x1', '50');
            xAxis.setAttribute('y1', '550');
            xAxis.setAttribute('x2', '750');
            xAxis.setAttribute('y2', '550');
            xAxis.setAttribute('stroke', 'black');
            xAxis.setAttribute('stroke-width', '2');
            svg.appendChild(xAxis);

            const yAxis = document.createElementNS(svgNS, 'line');
            yAxis.setAttribute('x1', '50');
            yAxis.setAttribute('y1', '550');
            yAxis.setAttribute('x2', '50');
            yAxis.setAttribute('y2', '50');
            yAxis.setAttribute('stroke', 'black');
            yAxis.setAttribute('stroke-width', '2');
            svg.appendChild(yAxis);

            // Add axis labels
            const xLabel = document.createElementNS(svgNS, 'text');
            xLabel.setAttribute('x', 760 / 2);
            xLabel.setAttribute('y', '580'); // Adjusted to be below the X-axis
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

            // Map evolution to x-axis positions
            const evolutionPositions = {
                'genesis': 100,
                'custom': 300,
                'product': 500,
                'commodity': 700
            };

            // Add X-axis labels
            Object.entries(evolutionPositions).forEach(([label, position]) => {
                const text = document.createElementNS(svgNS, 'text');                
                text.setAttribute('x', position);
                text.setAttribute('y', '565');
                text.setAttribute('font-size', '12');
                text.setAttribute('text-anchor', 'middle');
                text.textContent = label.charAt(0).toUpperCase() + label.slice(1);
                svg.appendChild(text);
            });

            // Draw dashed lines between evolution stages
            const evolutionStages = Object.values(evolutionPositions);
            for (let i = 1; i < evolutionStages.length; i++) {
                const dashedLine = document.createElementNS(svgNS, 'line');
                dashedLine.setAttribute('x1', (evolutionStages[i - 1] + evolutionStages[i]) / 2);
                dashedLine.setAttribute('y1', '550');
                dashedLine.setAttribute('x2', (evolutionStages[i - 1] + evolutionStages[i]) / 2);
                dashedLine.setAttribute('y2', '50');
                dashedLine.setAttribute('stroke', 'gray');
                dashedLine.setAttribute('stroke-width', '1');
                dashedLine.setAttribute('stroke-dasharray', '5,5'); // Dashed line
                svg.appendChild(dashedLine);
            }
        }

        // Calculate y-axis positions dynamically
        const yBase = 50; // Start from the top
        const yMax = 550; // Ensure components stay above the x-axis
        const yStep = Math.min((yMax - yBase) / components.length, 50); // Dynamically adjust spacing to fit all components

        // Map evolution to x-axis positions
        const evolutionPositions = {
            'genesis': 100,
            'custom': 300,
            'product': 500,
            'commodity': 700
        };

        // Clear existing elements in SVG to re-arrange everything
        Array.from(svg.querySelectorAll('line.graph-element, circle.graph-element, text.graph-element')).forEach(el => el.remove());

        // Draw dependencies first
        dependencies.forEach(dependency => {
            const sourceId = dependency.parentElement.id;
            const targetId = dependency.getAttribute('target');
            const source = components.find(c => c.id === sourceId);
            const target = components.find(c => c.id === targetId);

            if (source && target) {
                const sourceCx = evolutionPositions[source.getAttribute('evolution')] || 300;
                const sourceCy = yBase + components.indexOf(source) * yStep;
                const targetCx = evolutionPositions[target.getAttribute('evolution')] || 300;
                const targetCy = yBase + components.indexOf(target) * yStep;

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
            const cy = yBase + index * yStep; // Stack components top to bottom

            const circle = document.createElementNS(svgNS, 'circle');
            circle.classList.add('graph-element');
            circle.setAttribute('id', component.id);
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);

            // Dynamically set radius based on width/height from CSS
            const width = parseFloat(getComputedStyle(component).width) || 20;
            const height = parseFloat(getComputedStyle(component).height) || 20;
            const radius = Math.min(width, height) / 2;
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
