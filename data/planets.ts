export type Planet = {
  id: string;
  name: string;
  number: string;
  category: string;
  tagline: string;
  description: string;
  image: string;
  distance: string;
  orbit: string;
  diameter: string;
  moons: string;
  highlight: string;
  accent: string;
};

export const planets: Planet[] = [
  {
    id: "mercury",
    name: "Mercury",
    number: "01",
    category: "TERRESTRIAL PLANET",
    tagline: "The swiftest world",
    description: "A little world of immense extremes. Meet the closest planet to the Sun, where a year passes in just 88 days.",
    image: "/planets/mercury.webp",
    distance: "0.39 AU",
    orbit: "88 DAYS",
    diameter: "4,879 KM",
    moons: "0",
    highlight: "A world of extremes",
    accent: "#b6c1d2",
  },
  {
    id: "venus",
    name: "Venus",
    number: "02",
    category: "TERRESTRIAL PLANET",
    tagline: "The morning star",
    description: "Hidden beneath golden clouds, Venus is our hottest planetary neighbor and one of the night sky's brightest sights.",
    image: "/planets/venus.webp",
    distance: "0.72 AU",
    orbit: "225 DAYS",
    diameter: "12,104 KM",
    moons: "0",
    highlight: "Behind the golden clouds",
    accent: "#ecc68e",
  },
  {
    id: "earth",
    name: "Earth",
    number: "03",
    category: "TERRESTRIAL PLANET",
    tagline: "Our pale blue dot",
    description: "Our home. A brilliant oasis of oceans, clouds, and life, floating in the beautiful silence of space.",
    image: "/planets/earth.webp",
    distance: "1.00 AU",
    orbit: "365 DAYS",
    diameter: "12,742 KM",
    moons: "1",
    highlight: "The only home we've known",
    accent: "#90c9ff",
  },
  {
    id: "mars",
    name: "Mars",
    number: "04",
    category: "TERRESTRIAL PLANET",
    tagline: "The red frontier",
    description: "Dusty deserts, giant volcanoes, and the next great frontier of human exploration. The red planet is full of possibility.",
    image: "/planets/mars.webp",
    distance: "1.52 AU",
    orbit: "687 DAYS",
    diameter: "6,779 KM",
    moons: "2",
    highlight: "The next great frontier",
    accent: "#ed9b74",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    number: "05",
    category: "GAS GIANT",
    tagline: "King of the planets",
    description: "A magnificent giant wrapped in swirling clouds and colossal storms, with a family of remarkable icy moons.",
    image: "/planets/jupiter.webp",
    distance: "5.20 AU",
    orbit: "11.9 YEARS",
    diameter: "139,820 KM",
    moons: "95+",
    highlight: "The giant of our system",
    accent: "#e3b790",
  },
  {
    id: "saturn",
    name: "Saturn",
    number: "06",
    category: "GAS GIANT",
    tagline: "The ringed wonder",
    description: "An ethereal world adorned with vast rings made of ice and ancient debris. One of the Solar System's great spectacles.",
    image: "/planets/saturn.webp",
    distance: "9.58 AU",
    orbit: "29.4 YEARS",
    diameter: "116,460 KM",
    moons: "140+",
    highlight: "Elegance on a cosmic scale",
    accent: "#ead0a6",
  },
  {
    id: "uranus",
    name: "Uranus",
    number: "07",
    category: "ICE GIANT",
    tagline: "The tilted world",
    description: "Pale blue and quietly mysterious, Uranus rotates dramatically on its side against the distant starlight.",
    image: "/planets/uranus.webp",
    distance: "19.2 AU",
    orbit: "84 YEARS",
    diameter: "50,724 KM",
    moons: "28",
    highlight: "A planet unlike any other",
    accent: "#9ee8f1",
  },
  {
    id: "neptune",
    name: "Neptune",
    number: "08",
    category: "ICE GIANT",
    tagline: "Into the deep blue",
    description: "Venture to the edge of the planetary realm, where blue storms race through the atmosphere of a faraway giant.",
    image: "/planets/neptune.webp",
    distance: "30.1 AU",
    orbit: "165 YEARS",
    diameter: "49,244 KM",
    moons: "16",
    highlight: "Beyond the familiar horizon",
    accent: "#819cff",
  },
];

export const featuredPlanetIds = ["mercury", "saturn", "neptune"] as const;
