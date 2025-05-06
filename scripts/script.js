let interUrbanlat = 48.49103113795146;
let interUrbanlong = -123.41514114992222;
// Initialize the map and give it a starting point. Fix the zoom
var map = L.map('map', {
    center: [interUrbanlat, interUrbanlong],
    zoom: 13,
});

// Add the tile layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Add a marker at Interurban on load
var marker = L.marker([interUrbanlat, interUrbanlong]).addTo(map);
// Load and duplicate water polygons //
// This stuff is where Joe differentiates the land and sea. DON'T Change this Stuff //
// Unless you dont want it to work.
let waterPolygons;
// Duplicating the land and sea over 3 sets of world maps
function duplicateWaterPolygons(original) {
    const offsets = [-360, 0, 360];
    const allFeatures = [];

    for (const offset of offsets) {
        const wrapped = JSON.parse(JSON.stringify(original));
        for (const feature of wrapped.features) {
            const geom = feature.geometry;
            if (geom.type === "Polygon") {
                geom.coordinates = geom.coordinates.map(ring =>
                    ring.map(([lng, lat]) => [lng + offset, lat])
                );
            } else if (geom.type === "MultiPolygon") {
                geom.coordinates = geom.coordinates.map(polygon =>
                    polygon.map(ring =>
                        ring.map(([lng, lat]) => [lng + offset, lat])
                    )
                );
            }
        }
        allFeatures.push(...wrapped.features);
    }

    return {
        type: "FeatureCollection",
        features: allFeatures
    };
}
// Fetching JSON data to make the boundaries
fetch('./public/ocean.geojson')
    .then(res => res.json())
    .then(data => {
        waterPolygons = duplicateWaterPolygons(data);
    });
let ports = [];
let rout= [];
let startPoint = null;
let endPoint = null;
let totalDistance = 0;
let wayPoints = [];
let allMarkers = [];
/* Click event to detect land or water. You will have to add things and change things in here
But you won't likely want to delete  this! */

// Function to Animate the Boat
map.on('click', function (e) {
    if (!waterPolygons) return;

    const point = turf.point([e.latlng.lng, e.latlng.lat]);
    let isInWater = null;

    // Check if the point is within the water polygon
    for (let feature of waterPolygons.features) {
        if (turf.booleanPointInPolygon(point, feature)) {
            isInWater = true;
            break;
        }
    }

    if (isInWater) {
        if (!startPoint) {
            // Set the start point and add the marker
            startPoint = e.latlng;
            //collecting the markers so we can remove them when reset button is pressed
            let marker = L.marker(startPoint).addTo(map);
            allMarkers.push(marker);
        } else if (!endPoint) {

            // Set the end point and add the marker
            endPoint = e.latlng;
            //collecting the markers so we can remove them when reset button is pressed
            let marker = L.marker(endPoint).addTo(map);
            allMarkers.push(marker);

            // Add both points to the route and redraw the route
            rout.push(startPoint, endPoint);
            drawRout(rout);
            getVessels();
            // Start the boat animation if at least two points are added
            if (rout.length >= 2) {
                animateBoat(rout);
            }

            // Calculate and display the total distance
             totalDistance = distanceCalc(rout);
            $('#display-dist').html(`Total Distance: ${totalDistance} miles`);

            // Reset start and end points for the next route
            startPoint = endPoint;
            endPoint = null;
        } else {
            // Add a waypoint marker and update the route
            let marker = L.marker(e.latlng).addTo(map);
            wayPoints.push(marker);
            rout.push(e.latlng);
            drawRout(rout);
            getVessels();
            // Recalculate the distance and update the display
            let totalDistance = distanceCalc(rout);
            $('#display-dist').html(`Total Distance: ${totalDistance} miles`).css('color', 'white');

            // Start the boat animation if at least two points are added
            if (rout.length >= 2) {
                animateBoat(rout);
            }
        }
    }
});
// Boat icon
const boatIcon = L.icon({
    iconUrl: './icons/sailing-boat.png',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

// Create boat marker at initial postion
let boatMarker = L.marker([0, 0], { icon: boatIcon }).addTo(map);
function animateBoat(route) {
    // exit  if there arent at least 2 points to animate between
    if (route.length < 2) return;

    //boat speed
    const speed = 0.05;
    //current position of the boat between a and b
    let current = 0;
    // progress between the two points. from 0 start to 1 end
    let progress = 0;
    // Ensure we have a boat marker else we create one
    if (!boatMarker) {
        // start the marker at the beginning of the route
        boatMarker = L.marker(route[0], { icon: boatIcon }).addTo(map);
    } else {
        boatMarker.setLatLng(route[0]);
    }
    // the animation loop which runs every frame with requestAnimationFrame
    function step() {
        // If we reached the end of the route stop the animation
        if (current >= route.length - 1) return;
        // Get the current segment from -> to
        const from = route[current];
        const to = route[current + 1];

        // interpolate coordinates
        const lat = from.lat + (to.lat - from.lat) * progress;
        const lng = from.lng + (to.lng - from.lng) * progress;
        // move the boat marker to the new interpolated position
        boatMarker.setLatLng([lat, lng]);
        // Increment progress based on the speed
        progress += speed;
        // If we completed this segment move to the next one
        if (progress >= 1) {
            current++;
            progress = 0;
        }
        // Schedule the next frame
        requestAnimationFrame(step);
    }
    // start the animation
    step();
}

//getting the user location
if(navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        //user lat
        const userLat = position.coords.latitude;
        //user long
        const userLng = position.coords.longitude;
        //add to the user location onto map with a pop up text when clicked on
        L.marker([userLat, userLng]).addTo(map).bindPopup('You are here');
    })
}

 // Weather API
const apiKey = "6b1443c9b305ee2797330442323ed98d";
async function getWeather(city) {
    //calling the api
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;
        const response = await fetch(url);
        if (response.status === 200) {
            const data = await response.json();
            //storing the data from the api call
            const temp = (data.main.temp - 273.15).toFixed(2);
            const description = data.weather[0].description;
            const icon = data.weather[0].icon;

            //returingn the weather image with its description
            return `
                <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${description}" style="vertical-align: middle; width: 30px; height: 30px;">
                ${temp}°C - ${description}
            `;
        } else {
            return "Weather data unavailable";
        }
        //cathing if there is error returing the info
    } catch (error) {
        console.error("Weather API error:", error);
        return "Failed to load weather data.";
    }
}

//getting the icon styled
const portIcon = L.icon({
    iconUrl: './icons/ship-marker-bw-invert.svg',
    iconSize: [25, 25],
    iconAnchor: [12, 25]
});

let startingPort = '';
let endingPort = '';
//functuon to get the ports from the json file
async function getPorts() {
    const response = await fetch('./public/ports.json');
    let filePorts = await response.json();
    ports = filePorts;
    //looping through the ports
    for (let port of ports) {
        //hetting the coordinates
        const latlng = L.latLng(port.coordinates[0], port.coordinates[1]);
        let portMarker = L.marker(latlng, { icon: portIcon }).addTo(map);
        //passing the city names to the weather call
        const weatherInfo = await getWeather(port.cityName);
        //adding pop up to the ports
        portMarker.on('click', () => {

            //  popup content with weather included
            const popupContent = `
            <div class="card" style="width: 18rem;">
                <div class="card-body">
                    <h5 class="card-title">${port.name}</h5>
                    <p id="weatherDesc">${weatherInfo}</p>
                    <p class="card-text">Latitude ${port.coordinates[0]}<br>Longitude ${port.coordinates[1]}</p>
                </div>
            </div>
        `;

            // Bind and open popup
            portMarker.bindPopup(popupContent).openPopup();

            // Route logic
            rout.push(latlng);
            drawRout(rout);
            getVessels();
            animateBoat(rout);

            totalDistance = distanceCalc(rout);
            $('#display-dist').html(`Total Distance: ${totalDistance} miles`);

            if (rout.length === 1) {
                startingPort = port.name;
            } else {
                endingPort = port.name;
            }
            const markerTrail = L.marker(latlng).addTo(map);
            allMarkers.push(markerTrail);
        });
    }

}



//this will draw a blue line betwwen the ports
const drawRout = (rout) => {
    if (window.routePolyline) {
        // Remove previous route
        map.removeLayer(window.routePolyline);
    }
    // Draw new route
    window.routePolyline = L.polyline(rout, { color: "blue" }).addTo(map);
}

let distanceInMiles;
const distanceCalc = (rout) => {
    // If there are less than 2 points, no distance to calculate
    if (rout.length < 2) return 0;
    let totalDistance = 0;
    // Loop through the route array and calculate the distance between consecutive points
    for (let i = 0; i < rout.length - 1; i++) {
        let pointA = rout[i];
        let pointB = rout[i + 1];
        // Use the distanceTo function to get the distance between two points
        totalDistance += pointA.distanceTo(pointB);

    }
    // Convert the distance to miles and round to 2 decimal places
     distanceInMiles = (totalDistance / 1609.34).toFixed(2);
    return distanceInMiles;
};

//calling the getPort func
getPorts();
let suitableBoat;
//function to fetch the xessels data
async function getVessels() {
    //fetching
    const response = await fetch('./public/vessels.json');
    const vessels = await response.json();
    //filter the boats that can travel based on the distance
    suitableBoat = vessels.filter(vessel => {
        return vessel.max_travel_distance_nautical_miles === 'Unlimited' || parseFloat(vessel.max_travel_distance_nautical_miles) >= distanceInMiles
    });
    //calling the display function and passing in the filtered boats
    displayBoats(suitableBoat);
}
const taxRate = 0.05;
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentBoats = [];
//displaying the boats
const displayBoats = (boats) => {
    //filterin the boats that are already inside the offcanvas so they are not displayed again when the page refreshes since the boats are
    //stored inside the offcanvas and can add duplicate items to the catalogue if an item is removed by the user since removing
    //will add the item back to the catalogue
    //some() makes sure if there is not at least one item inside the catalogue that has the same name as the current boat
    //if no mathing name, some returns true and the catalogue will have the filtered boats only
    const filteredBoats = boats.filter(boat => !cart.some(cartItem => cartItem.name === boat.name));
    //assign the boats to an array
    currentBoats = filteredBoats;
    //clear the catalog
    $('.boatCatalog').empty();

    //loop through the boats and append them to a card dynamically
    currentBoats.forEach((vessel, index) => {
        $('.boatCatalog').append(`
            <div class="card m-2" style="width: 18rem;" data-boat-index="${index}">
                <img src="${vessel.picture}" class="card-img-top" alt="...">
                <div class="card-body">
                    <h5 class="card-title">${vessel.type}</h5>
                    <ul class="card-text">
                        <li>Speed: ${vessel.speed_knots}</li>
                        <li>Length: ${vessel.length_meters}</li>
                        <li>Crew Needed: ${vessel.crew_required}</li>
                        <li>Cost per mile: ${vessel.cost_per_nautical_mile}</li>
                        <li>Total cost: $${( (vessel.cost_per_nautical_mile * distanceInMiles) + (vessel.crew_required * vessel.base_rental_rate) + vessel.fuel_surcharge * (taxRate + 1)).toFixed(2)}</li>
                    </ul>
                    <button class="btn addToCart" data-index="${index}" data-bs-toggle="offcanvas" data-bs-target="#offcanvasWithBothOptions">
                        Add to Cart
                    </button>
                </div>
            </div>
        `);
    });
};
$('#remove').hide();
$('#checkout').hide();
// Function to rebuild the offcanvas UI based on the current cart
function updatedOffCanvas() {
    // Empty the offcanvas body before re-appending the updated cards
    $('.offcanvas-body').html('<div id="formContainer"></div>');
    // Append each boat in the cart back into the offcanvas
    cart.forEach((vessel, index) => {
        $('.offcanvas-body').append(`
            <div class="card m-2" style="width: 18rem;" data-boat-index="${index}">
                <img src="${vessel.picture}" class="card-img-top" alt="...">
                <div class="card-body">
                    <h5 class="card-title">${vessel.type}</h5>
                    <ul class="card-text">
                        <li>Speed: ${vessel.speed_knots}</li>s
                        <li>Length: ${vessel.length_meters}</li>
                        <li>Crew Needed: ${vessel.crew_required}</li>
                        <li>Cost per mile: ${vessel.cost_per_nautical_mile}</li>
                        <li>Total cost: $${( (vessel.cost_per_nautical_mile * distanceInMiles) + (vessel.crew_required * vessel.base_rental_rate) + vessel.fuel_surcharge * (taxRate + 1)).toFixed(2)}</li>
                    </ul>
                    <button class="btn btn-danger remove" type="button" data-index="${index}">Remove</button>
                     <a href="#formContainer" type="button" class="btn btn-warning checkoutBtn" data-index="${index}">Checkout</a>
                </div>
            </div> 
        `);
    });
}
$(document).on( 'submit','#bookingForm',function(e){
    e.preventDefault();
})
let selectedBoatIndex = null;

//opening the modal in the checkoutBtn click inside the cart
$(document).on('click','.checkoutBtn',function(e){
 
    //getting the selceted item
    selectedBoatIndex = $(this).data('index');
    const vessel = cart[selectedBoatIndex];
    //giving each modal a unique id
    //emplty the form cotainer
    $('#formContainer').empty();
    //appenf the form to the offcanvas on top of the carts
    $('#formContainer').append(`
<div class="card" style="width: 18rem;">
  <div class="card-body">
    <h5 class="card-title">Enter Your Personal Information</h5>
    <form id="bookingForm">
        <div class="mb-3">
            <i class="bi bi-person p-2 form-control d-inline"></i>
            <input type="text" class="form-control d-inline-block myClass" id="firstName" placeholder="First Name">
            <span id="validateSign5"></span>
        </div>
        <div class="mb-3">
            <i class="bi bi-person p-2 form-control d-inline"></i>
            <input type="text" class="form-control d-inline-block myClass" id="lastName" placeholder="Last Name">
            <span id="validateSign4"></span>
        </div>
        <div class="mb-3">
            <i class="bi bi-envelope p-2 form-control d-inline"></i>
            <input type="email" class="form-control d-inline-block myClass" id="emailAddress" placeholder="Email">
            <span id="validateSign3"></span>
        </div>
        <div class="mb-3">
            <i class="bi bi-123 p-2 form-control d-inline"></i>
            <input type="number" class="form-control d-inline-block myClass" id="age" placeholder="Age">
            <span id="validateSign2"></span>
        </div>
        <div class="mb-3">
            <i class="bi bi-mailbox p-2 form-control d-inline"></i>
            <input type="text" class="form-control d-inline-block myClass" id="postalCode" placeholder="Postal Code">
            <span id="validateSign1"></span>
        </div>
        <div class="mb-3">
            <i class="bi bi-telephone p-2 form-control d-inline"></i>
            <input type="tel" class="form-control d-inline-block myClass" id="contact" placeholder="Phone Number">
            <span id="validateSign"></span>
        </div>
        <button type="submit" class="btn w-100" id="submitForm">Book</button>
    </form>
  </div>
</div>
`);
})

//saving the cart to local storage
function saveCartToStorage(){
    //convert the cart to string before saving it
    localStorage.setItem('cart', JSON.stringify(cart));
}
// adding click event to the add to cart btn
$(document).on('click', '.addToCart', function () {
    // Get the index of the selected boat
    const index = $(this).data('index');

    // Make sure the currentBoats array is defined
    if (typeof currentBoats !== 'undefined') {
        // Add the selected boat to the cart
        cart.push(currentBoats[index]);
        //save the cart
        saveCartToStorage()
        // Rebuild the offcanvas UI by clearing it first
        updatedOffCanvas();
        // Update the total boats count in the offcanvas
        $('#offcanvasWithBothOptionsLabel').html(`Total Boats: ${cart.length}`);
        // Remove the selected boat card from the catalog
        $(this).closest('.card').remove();
    }
});

//function for remove button press
$(document).on('click', '.remove', function () {
    const index = $(this).data('index');

    // Remove from cart and store the removed vessel
    const [removedVessel] = cart.splice(index, 1);
    // Save updated cart
    saveCartToStorage();
    // call the updated offcanvas
    updatedOffCanvas();
    // Update label
    $('#offcanvasWithBothOptionsLabel').html(`Total Boats: ${cart.length}`);
    // Push the removed boat back to available boats
    currentBoats.push(removedVessel);
    // Get the correct new index
    const newIndex = currentBoats.length - 1;
    // Append the removed boat back to the catalog
    $('.boatCatalog').append(`
        <div class="card m-2" style="width: 18rem;" data-boat-index="${newIndex}">
            <img src="${removedVessel.picture}" class="card-img-top" alt="Boat">
            <div class="card-body">
                <h5 class="card-title">${removedVessel.type}</h5>
                <ul class="card-text">
                    <li>Speed: ${removedVessel.speed_knots}</li>
                    <li>Length: ${removedVessel.length_meters}</li>
                    <li>Crew Needed: ${removedVessel.crew_required}</li>
                    <li>Cost per mile: ${removedVessel.cost_per_nautical_mile}</li>
                    <li>Total cost: $${( (removedVessel.cost_per_nautical_mile * distanceInMiles) + (removedVessel.crew_required * removedVessel.base_rental_rate) + removedVessel.fuel_surcharge* (taxRate + 1)).toFixed(2)}</li>
                </ul>
                <button class="btn addToCart" data-index="${newIndex}" data-bs-toggle="offcanvas" data-bs-target="#offcanvasWithBothOptions">
                    Add to Cart
                </button>
            </div>
        </div>
    `);
});

//remove all items from the cart and place them back in the catalogue
$('#removeAll').on('click', function () {

    cart.forEach((vessel) => {
        currentBoats.push(vessel);
        // Get the correct new index
        const newIndex = currentBoats.length - 1;
        // Append the removed boat back to the catalog
        $('.boatCatalog').append(`
        <div class="card m-2" style="width: 18rem;" data-boat-index="${newIndex}">
            <img src="${vessel.picture}" class="card-img-top" alt="Boat">
            <div class="card-body">
                <h5 class="card-title">${vessel.type}</h5>
                <ul class="card-text">
                    <li>Speed: ${vessel.speed_knots}</li>
                    <li>Length: ${vessel.length_meters}</li>
                    <li>Crew Needed: ${vessel.crew_required}</li>
                    <li>Cost per mile: ${vessel.cost_per_nautical_mile}</li>
                    <li>Total cost: $${( (vessel.cost_per_nautical_mile * distanceInMiles) + (vessel.crew_required * vessel.base_rental_rate) + vessel.fuel_surcharge * (taxRate + 1)).toFixed(2)}</li>
                </ul>
                <button class="btn addToCart" data-index="${newIndex}" data-bs-toggle="offcanvas" data-bs-target="#offcanvasWithBothOptions">
                    Add to Cart
                </button>
            </div>
        </div>
    `);
    });
    //empty the offcanvas
    $('.offcanvas-body').empty();
    //clear cart
    cart= [];
    //clear the local storage
    localStorage.removeItem('cart');
    $('#offcanvasWithBothOptionsLabel').html(`Total Boats: 0`);

})

function resetFormFields() {
    // Reset first name
    document.getElementById("firstName").value = "";
    document.getElementById("firstName").style.borderColor = "";
    document.getElementById("firstName").placeholder = "First Name";
    document.getElementById("validateSign5").innerHTML = "";

    // Reset last name
    document.getElementById("lastName").value = "";
    document.getElementById("lastName").style.borderColor = "";
    document.getElementById("lastName").placeholder = "Last Name";
    document.getElementById("validateSign4").innerHTML = "";

    // Reset email
    document.getElementById("emailAddress").value = "";
    document.getElementById("emailAddress").style.borderColor = "";
    document.getElementById("emailAddress").placeholder = "Email Address";
    document.getElementById("validateSign3").innerHTML = "";

    // Reset age
    document.getElementById("age").value = "";
    document.getElementById("age").style.borderColor = "";
    document.getElementById("age").placeholder = "Age";
    document.getElementById("validateSign2").innerHTML = "";

    // Reset postal code
    document.getElementById("postalCode").value = "";
    document.getElementById("postalCode").style.borderColor = "";
    document.getElementById("postalCode").placeholder = "Postal Code";
    document.getElementById("validateSign1").innerHTML = "";

    // Reset contact number
    document.getElementById("contact").value = "";
    document.getElementById("contact").style.borderColor = "";
    document.getElementById("contact").placeholder = "Phone Number";
    document.getElementById("validateSign").innerHTML = "";
}
    //modal form verification
function firstNameVerification(){
    //blank
    let blankInput = /^\s*$/;
    //No space
    let whiteSpace =/\s/;
    let valid = true;
    //first name blank condition
    let fName = document.getElementById("firstName").value;
    if (blankInput.test(fName)){
        document.getElementById("firstName").value = "";
        document.getElementById("firstName").style.borderColor = "red";
        document.getElementById("firstName").placeholder= "Name is Reuired";
        document.getElementById("validateSign5").innerHTML = "❌";
        valid =false;
    }else if(whiteSpace.test(fName)){
        document.getElementById("firstName").value = "";
        document.getElementById("firstName").style.borderColor = "red";
        document.getElementById("firstName").placeholder= "Space is not allowed";
        document.getElementById("validateSign5").innerHTML = "❌";
        valid =false;
    } else{
        document.getElementById("firstName").style.borderColor = "green";
        document.getElementById("validateSign5").innerHTML = "✅";
        return fName;
    }
    return;
}
function lastNameVerification(){
    //blank
    let blankInput = /^\s*$/;
    //No space
    let whiteSpace =/\s/;
    let lName = document.getElementById("lastName").value;
    let valid = true;
    //last name blank condition
    if (blankInput.test(lName)){
        document.getElementById("lastName").value = "";
        document.getElementById("lastName").style.borderColor = "red";
        document.getElementById("lastName").placeholder= "Last name is Reuired";
        document.getElementById("validateSign4").innerHTML = "❌";
        valid =false;
    }else if(whiteSpace.test(lName)){
        document.getElementById("lastName").value = "";
        document.getElementById("lastName").style.borderColor = "red";
        document.getElementById("lastName").placeholder= "Space is not allowed";
        document.getElementById("validateSign4").innerHTML = "❌";
        valid =false;
    } else{
        document.getElementById("lastName").style.borderColor = "green";
        document.getElementById("validateSign4").innerHTML = "✅";
        return lName;
    }
}
function emailVerification(){
    //blank
    let blankInput = /^\s*$/;
    //Email regex
    let emailValidation = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    let email = document.getElementById("emailAddress").value;
    let valid = true;
    //email blank condition
    if(!emailValidation.test(email)){
        document.getElementById("emailAddress").value = "";
        document.getElementById("emailAddress").style.borderColor = "red";
        document.getElementById("emailAddress").placeholder= "Not a valid email address";
        document.getElementById("validateSign3").innerHTML = "❌";
        valid =false;
    } else if(blankInput.test(email)){
        document.getElementById("emailAddress").value = "";
        document.getElementById("emailAddress").style.borderColor = "red";
        document.getElementById("emailAddress").placeholder= "Email Address Required";
        document.getElementById("validateSign3").innerHTML = "❌";
        valid =false;
    }else{
        document.getElementById("emailAddress").style.borderColor = "green";
        document.getElementById("validateSign3").innerHTML = "✅";
        return email;
    }
}
function ageVerification(){
    let blankInput = /^\s*$/;
    //number range
    let numberRange = /^(0|[1-9][0-9]?|1[01][0-9]|120)$/;
    let age = document.getElementById("age").value;
    let valid = true;
    //age blank condition
    if (blankInput.test(age)){
        document.getElementById("age").value = "";
        document.getElementById("age").style.borderColor = "red";
        document.getElementById("age").placeholder= "Age is Reuired";
        document.getElementById("validateSign2").innerHTML = "❌";
        valid =false;
    }else if(!numberRange.test(age)){
        document.getElementById("age").value = "";
        document.getElementById("age").style.borderColor = "red";
        document.getElementById("age").placeholder= "Wrong age";
        document.getElementById("validateSign2").innerHTML = "❌";
        valid =false;
    } else{
        document.getElementById("age").style.borderColor = "green";
        document.getElementById("validateSign2").innerHTML = "✅";
        return age;
    }
}
function postalCodeVerification(){
    let blankInput = /^\s*$/;
    //number range
    let postalCodeValidation = /^[ABCEGHJ-NPRSTVXY]\d[A-Z] \d[A-Z]\d$|^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/;
    let postalCode = document.getElementById("postalCode").value.trim();
    let valid =true;
    //postal code blank condition
    if (blankInput.test(postalCode)){
        document.getElementById("postalCode").value = "";
        document.getElementById("postalCode").style.borderColor = "red";
        document.getElementById("postalCode").placeholder= "Postal code is Reuired";
        document.getElementById("validateSign1").innerHTML = "❌";
        valid = false;
    }else if(!postalCodeValidation.test(postalCode)){
        document.getElementById("postalCode").value = "";
        document.getElementById("postalCode").style.borderColor = "red";
        document.getElementById("postalCode").placeholder= "Wrong postal code";
        document.getElementById("validateSign1").innerHTML = "❌";
        valid = false;
    } else{
        document.getElementById("postalCode").style.borderColor = "green";
        document.getElementById("validateSign1").innerHTML = "✅";
        return postalCode;
    }
}
function phoneVerification(){
    let blankInput = /^\s*$/;
    //phone regex format 000 000 0000 0000000000 000-000-0000
    let phoneNumValidation = /^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/;
    let contactNumber = document.getElementById("contact").value;
    let valid = true;
    //phone number blank condition
    if (blankInput.test(contactNumber)){
        document.getElementById("contact").value = "";
        document.getElementById("contact").style.borderColor = "red";
        document.getElementById("contact").placeholder= "Phone number is Reuired";
        document.getElementById("validateSign").innerHTML = "❌";
        valid = false;
    }else if(!phoneNumValidation.test(contactNumber)){
        document.getElementById("contact").value = "";
        document.getElementById("contact").style.borderColor = "red";
        document.getElementById("contact").placeholder= "Wrong number";
        document.getElementById("validateSign").innerHTML = "❌";
        valid = false;
    } else{
        document.getElementById("contact").style.borderColor = "green";
        document.getElementById("validateSign").innerHTML = "✅";
        return contactNumber;
    }
}

$(document).on('click', '#submitForm', function (e) {
    // Calling the methods
    let fName = firstNameVerification();
    let lName = lastNameVerification();
    let email = emailVerification();
    let age = ageVerification();
    let postalCode = postalCodeVerification();
    let contactNumber = phoneVerification();

    // If methods are returning true then adding the info to the card
    if (fName && lName && email && age && postalCode && contactNumber) {
        $('#staticBackdrop').remove();

        // Get the selected vessel from cart
        const vessel = cart[selectedBoatIndex];
            $('#staticBackdrop').remove();

            // Insert the modal content
            $('#results').html(`
                <div class="modal fade mayMaudul" id="staticBackdrop" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="staticBackdropLabel" aria-hidden="true">
                    <div class="modal-dialog">
                        <div class="modal-content" id="myModalCont">
                            <div class="modal-header">
                                <h1 class="aboutSectexts modal-title fs-5" id="staticBackdropLabel">Your Booking Details</h1>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <!-- Nav tabs -->
                                <ul class="nav nav-tabs" id="bookingTabs" role="tablist">
                                    <li class="nav-item" role="presentation">
                                        <button class="nav-link active" id="details-tab" data-bs-toggle="tab" data-bs-target="#detailsTab" type="button" role="tab">Booking Details</button>
                                    </li>
                                    <li class="nav-item d-none" role="presentation" id="confirmTabNav">
                                        <button class="nav-link" id="confirm-tab" data-bs-toggle="tab" data-bs-target="#confirmationTab" type="button" role="tab">Confirmation</button>
                                    </li>
                                </ul>

                                <!-- Tab panes -->
                                <div class="tab-content pt-3">
                                    <div class="tab-pane fade show active" id="detailsTab" role="tabpanel">
                                        <img src="${vessel.picture}" class="card-img-top" alt="...">
                                        <p class="aboutSectexts">${vessel.name}</p>
                                        <p class="aboutSectexts">Total Distance Travelled: ${distanceInMiles}</p>
                                        <p class="aboutSectexts">Starting Port: ${startingPort}</p>
                                        <p class="aboutSectexts">Destination: ${endingPort}</p>
                                        <p class="aboutSectexts">Total Cost: $${(
                                        ((vessel.cost_per_nautical_mile * distanceInMiles) +
                                         (vessel.crew_required * vessel.base_rental_rate) +
                                        vessel.fuel_surcharge) * (1 + taxRate)
                                        ).toFixed(2)}</p>
                                    </div>

                                    <div class="tab-pane fade" id="confirmationTab" role="tabpanel">
                                        <h5 class="text-success">✅ Your booking has been confirmed!</h5>
                                        <p class="aboutSectexts">Thank you for booking <strong>${vessel.name}</strong>.</p>
                                        <p class="aboutSectexts">Starting Port: <strong>${startingPort}</strong></p>
                                        <p class="aboutSectexts">Ending Port: <strong>${endingPort}</strong></p>
                                        <p class="aboutSectexts">Total Cost: <strong>$${( (vessel.cost_per_nautical_mile * distanceInMiles) + (vessel.crew_required * vessel.base_rental_rate) + vessel.fuel_surcharge * (taxRate + 1)).toFixed(2)}</strong></p>
                                        <p class="aboutSectexts">We’ve emailed the booking details to <strong>${email}</strong>.</p>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-warning aboutSectexts" data-bs-dismiss="modal" id="close-tab">Close</button>
                                <button type="button" id="finalBook" class="btn btn-success">Confirm Booking</button>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            // Initialize the modal
            const myModal = new bootstrap.Modal(document.getElementById('staticBackdrop'));
            myModal.show();
    }
});


//confirmation tab after finalzing
$(document).on('click', '#finalBook', function () {

    //  remove the class that hid confitmation tab
    $('#confirmTabNav').removeClass('d-none');
    $('#finalBook').remove();
    // Switch to the confirmation tab
    const confirmationTab = new bootstrap.Tab(document.querySelector('#confirm-tab'));
    confirmationTab.show();
});

//removing the modal after closing it
$('#close-tab').on('click', function () {
    $('.mayMaudul').remove();
})
// resetes all the point selected on the map by the user
$('#resetBtn').on('click', () => {
    //  Remove all markers from map
    allMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    allMarkers = [];

    // Remove all waypoint markers
    wayPoints.forEach(marker => {
        map.removeLayer(marker);
    });
    wayPoints = [];

    // Remove route polyline if it exists
    if (window.routePolyline) {
        map.removeLayer(window.routePolyline);
        window.routePolyline = null;
    }

    // Remove boat marker if it exists
    if (boatMarker) {
        map.removeLayer(boatMarker);
        boatMarker = null;
    }

    // ✅ Reset route and location info
    startPoint = null;
    endPoint = null;
    rout = [];
    totalDistance = 0;
    startingPort = '';
    endingPort = '';
// Reset boatMarker to its first state
    boatMarker = L.marker([0, 0], { icon: boatIcon }).addTo(map);

    // ✅ Clear distance display
    $('#display-dist').html(`Total Distance: 0 miles`);
});