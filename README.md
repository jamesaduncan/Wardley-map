# Wardley-map
A web component to draw Wardley Maps

# Example

        <wardley-map>
            <wardley-component id="c-cup-of-tea" name="Cup of Tea" evolution="custom">
                <wardley-dependency target="c-cup"></wardley-dependency>
                <wardley-dependency target="c-tea"></wardley-dependency>
            </wardley-component>

            <wardley-component id="c-cup" name="Cup" evolution="product"></wardley-component>
            
            <wardley-component id="c-tea" name="Tea">
                <wardley-dependency target="c-hot-water"></wardley-dependency>
                <wardley-dependency target="c-milk"></wardley-dependency>
                <wardley-dependency target="c-sugar"></wardley-dependency>
                <wardley-dependency target="c-teabag"></wardley-dependency>
            </wardley-component>

            <wardley-compenent id="c-milk" name="Milk" evolution="product"></wardley-compenent>
            <wardley-component id="c-sugar" name="Sugar" evolution="commodity"></wardley-component>
            <wardley-component id="c-teabag" name="Teabag" evolution="product"></wardley-component>

            <wardley-component id="c-hot-water" name="Hot Water" evolution="custom">
                <wardley-dependency target="c-water"></wardley-dependency>
                <wardley-dependency target="c-kettle"></wardley-dependency>
            </wardley-component>

            <wardley-component id="c-kettle" name="Kettle" evolution="product">
                <wardley-dependency target="c-electricty"></wardley-dependency>
            </wardley-component>

            <wardley-component id="c-water" name="Water" evolution="commodity">
            </wardley-component>

            <wardley-component id="c-electricty" name="Electricity" evolution="commodity"></wardley-component>
            
        </wardley-map>
