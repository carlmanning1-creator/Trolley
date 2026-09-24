// Built-in Australian supermarket keyword map. Step 2 of aisle auto-sort.
// The longest matching phrase wins, so "peanut butter" beats "butter" and "frozen peas" beats "peas".

export const AISLE_KEYWORDS: Record<string, string[]> = {
  "Fruit & Veg": [
    "apple", "banana", "orange", "mandarin", "lemon", "lime", "grape", "pear", "peach", "nectarine",
    "plum", "apricot", "mango", "pineapple", "watermelon", "rockmelon", "honeydew", "kiwi", "kiwifruit",
    "strawberry", "strawberries", "blueberry", "blueberries", "raspberry", "raspberries", "cherry",
    "cherries", "passionfruit", "avocado", "avo", "tomato", "cherry tomatoes", "potato", "sweet potato",
    "carrot", "onion", "red onion", "spring onion", "shallot", "garlic", "ginger", "broccoli", "broccolini",
    "cauliflower", "cabbage", "lettuce", "iceberg", "cos", "rocket", "spinach", "baby spinach", "kale",
    "salad mix", "cucumber", "lebanese cucumber", "zucchini", "eggplant", "capsicum", "chilli", "corn",
    "sweetcorn", "mushroom", "celery", "pumpkin", "butternut", "beans", "green beans", "snow peas",
    "sugar snap", "asparagus", "beetroot", "radish", "leek", "fennel", "herbs", "parsley", "coriander",
    "basil", "mint", "rosemary", "thyme", "dill", "bok choy", "pak choy", "choy sum", "wombok",
    "fruit", "veg", "vegetables", "salad", "sprouts", "bean sprouts", "grapefruit", "figs", "dates",
    "coconut", "potatoes", "tomatoes", "brushed potatoes", "chat potatoes", "kent pumpkin",
  ],
  Bakery: [
    "bread", "loaf", "sourdough", "wholemeal", "multigrain", "white bread", "raisin toast", "rolls",
    "bread rolls", "hot dog rolls", "burger buns", "buns", "wraps", "tortillas", "pita", "pitta",
    "naan", "croissant", "crumpets", "english muffins", "bagels", "baguette", "turkish bread",
    "garlic bread", "scones", "hot cross buns", "donuts", "doughnuts", "muffins", "cake", "mud cake",
    "lamingtons", "finger buns", "brioche", "focaccia", "sandwich bread",
  ],
  Deli: [
    "ham", "shaved ham", "salami", "prosciutto", "pastrami", "chorizo", "kabana", "cabanossi",
    "olives", "dips", "hummus", "tzatziki", "antipasto", "feta", "brie", "camembert", "blue cheese",
    "cheese platter", "sliced turkey", "sliced chicken", "pate", "semi dried tomatoes", "sun dried tomatoes",
    "marinated", "roast chicken", "bbq chicken", "chook",
  ],
  "Meat & Seafood": [
    "beef", "mince", "beef mince", "pork mince", "chicken mince", "steak", "rump", "scotch fillet",
    "porterhouse", "sirloin", "eye fillet", "chuck", "brisket", "roast", "lamb", "lamb chops", "cutlets",
    "leg of lamb", "lamb shanks", "pork", "pork chops", "pork belly", "ribs", "chicken", "chicken breast",
    "chicken thighs", "thigh fillets", "drumsticks", "wings", "chicken wings", "whole chicken",
    "sausages", "snags", "sausage", "bacon", "rashers", "meatballs", "rissoles", "schnitzel",
    "kangaroo", "veal", "fish", "salmon", "barramundi", "flathead", "snapper", "whiting", "basa",
    "prawns", "shrimp", "calamari", "squid", "mussels", "oysters", "scallops", "crab", "lobster",
    "tuna steak", "burger patties", "patties", "diced beef", "stir fry beef", "osso bucco", "gravy beef",
  ],
  "Dairy & Eggs": [
    "milk", "full cream milk", "skim milk", "lite milk", "light milk", "lactose free milk", "a2 milk",
    "almond milk", "oat milk", "soy milk", "long life milk", "cream", "thickened cream", "sour cream",
    "butter", "margarine", "spread", "cheese", "tasty cheese", "cheddar", "mozzarella", "parmesan",
    "grated cheese", "shredded cheese", "cheese slices", "cream cheese", "philadelphia", "cottage cheese",
    "ricotta", "haloumi", "halloumi", "yoghurt", "yogurt", "greek yoghurt", "yoghurt pouches", "eggs",
    "egg", "free range eggs", "custard", "dairy", "mascarpone", "creme fraiche", "kefir",
  ],
  Fridge: [
    "dip", "fresh pasta", "gnocchi", "ravioli", "tortellini", "pastry", "puff pastry", "shortcrust",
    "fresh juice", "orange juice", "apple juice", "tofu", "tempeh", "coleslaw", "salad kit",
    "cold meat", "frankfurts", "frankfurters", "hot dogs", "kransky", "pizza bases", "fresh noodles",
    "hokkien noodles", "udon", "pesto", "fresh soup", "dumplings", "wontons", "kimchi", "sauerkraut",
    "ready meal", "yakult", "chilled",
  ],
  Frozen: [
    "frozen", "frozen peas", "peas", "frozen corn", "frozen veg", "frozen vegetables", "frozen berries",
    "frozen chips", "fries", "wedges", "hash browns", "ice cream", "icecream", "gelato",
    "sorbet", "icy poles", "ice blocks", "magnum", "paddle pop", "frozen pizza", "pizza", "fish fingers",
    "nuggets", "chicken nuggets", "chicken kiev", "pies", "pie", "sausage rolls", "party pies",
    "spring rolls", "dim sims", "frozen dumplings", "frozen meals", "ice", "bag of ice", "frozen prawns",
    "garlic bread frozen", "frozen pastry", "edamame",
  ],
  Pantry: [
    "pasta", "spaghetti", "penne", "fettuccine", "macaroni", "lasagne sheets", "lasagna sheets", "rice",
    "basmati", "jasmine rice", "brown rice", "arborio", "risotto rice", "noodles", "2 minute noodles",
    "instant noodles", "rice noodles", "flour", "plain flour", "self raising flour", "sugar", "brown sugar",
    "icing sugar", "caster sugar", "baking powder", "bicarb", "bicarb soda", "yeast", "vanilla",
    "cocoa", "choc chips", "chocolate chips", "oil", "olive oil", "vegetable oil", "canola oil",
    "spray oil", "vinegar", "balsamic", "salt", "pepper", "spices", "paprika", "cumin", "cinnamon",
    "curry powder", "oregano", "stock", "stock cubes", "chicken stock", "beef stock", "gravy",
    "gravy powder", "tinned tomatoes", "canned tomatoes", "diced tomatoes", "passata", "tomato paste",
    "tomato sauce", "bbq sauce", "sauce", "soy sauce", "fish sauce", "oyster sauce", "sweet chilli sauce",
    "sriracha", "mayo", "mayonnaise", "mustard", "relish", "chutney", "pasta sauce", "curry paste",
    "coconut milk", "coconut cream", "tuna", "tinned tuna", "salmon tin", "baked beans", "beans tin",
    "chickpeas", "lentils", "kidney beans", "four bean mix", "soup", "tinned soup", "corn kernels",
    "beetroot tin", "peanut butter", "vegemite", "jam", "honey", "nutella", "golden syrup",
    "maple syrup", "breadcrumbs", "panko", "taco kit", "taco shells", "tortilla chips", "burrito kit",
    "stuffing", "cornflour", "gelatine", "jelly", "custard powder", "nuts", "almonds", "cashews",
    "walnuts", "sultanas", "raisins", "dried fruit", "seeds", "chia", "quinoa", "couscous",
    "pickles", "gherkins", "capers", "olive oil spray", "sesame oil", "tahini", "salsa", "tinned fruit",
    "long life cream", "evaporated milk", "condensed milk", "powdered milk", "rice paper",
  ],
  Breakfast: [
    "cereal", "weet-bix", "weetbix", "weet bix", "corn flakes", "cornflakes", "rice bubbles",
    "nutri-grain", "nutrigrain", "coco pops", "special k", "just right", "sultana bran", "all bran",
    "muesli", "granola", "oats", "rolled oats", "quick oats", "porridge", "uncle tobys", "up & go",
    "up and go", "breakfast bars", "pancake mix", "shake n bake",
  ],
  "Snacks & Lollies": [
    "chips", "crisps", "smiths", "doritos", "pringles", "shapes", "cheezels", "twisties", "burger rings",
    "popcorn", "pretzels", "crackers", "rice crackers", "jatz", "sao", "vita-weat", "vitaweat",
    "cruskits", "biscuits", "tim tams", "tim tam", "scotch fingers", "arnotts", "anzac biscuits",
    "chocolate", "choc", "cadbury", "freddo", "kit kat", "kitkat", "mars bar", "snickers",
    "lollies", "lolly", "snakes", "allens", "natural confectionery", "gummies", "mints", "chewing gum",
    "gum", "muesli bars", "snack bars", "protein bars", "fruit bars", "roll ups", "le snak",
    "dried seaweed", "trail mix", "cookies", "shortbread", "wafers",
  ],
  Drinks: [
    "water", "sparkling water", "mineral water", "soda water", "soft drink", "coke", "coca cola",
    "pepsi", "sprite", "fanta", "solo", "lemonade", "ginger beer", "tonic", "cordial", "juice",
    "iced tea", "kombucha", "energy drink", "red bull", "v energy", "sports drink", "gatorade",
    "powerade", "coffee", "instant coffee", "coffee beans", "ground coffee", "coffee pods", "pods",
    "tea", "tea bags", "green tea", "herbal tea", "milo", "hot chocolate", "chai", "iced coffee",
    "beer", "wine", "cider", "long neck", "ginger ale", "mixers", "coconut water", "flavoured milk",
  ],
  "Health & Beauty": [
    "shampoo", "conditioner", "soap", "body wash", "shower gel", "hand wash", "deodorant", "deo",
    "toothpaste", "toothbrush", "floss", "mouthwash", "razors", "shaving cream", "moisturiser",
    "sunscreen", "sunblock", "lip balm", "makeup", "make up", "mascara", "nail polish", "cotton buds",
    "cotton balls", "cotton pads", "tampons", "pads", "panty liners", "sanitary", "panadol",
    "paracetamol", "nurofen", "ibuprofen", "vitamins", "band aids", "bandaids", "plasters",
    "antiseptic", "hand sanitiser", "hand sanitizer", "tissues", "hair ties", "dry shampoo",
    "face wash", "body lotion", "cold and flu", "lozenges", "strepsils", "hairspray", "hair gel",
    "contact lens solution", "fish oil",
  ],
  Baby: [
    "nappies", "nappy", "baby wipes", "wipes", "formula", "baby formula", "baby food", "rusks",
    "baby shampoo", "baby wash", "nappy bags", "bottles", "dummy", "teething", "pull ups",
  ],
  "Cleaning & Household": [
    "toilet paper", "loo paper", "toilet roll", "paper towel", "paper towels", "napkins", "serviettes",
    "dishwashing liquid", "dish soap", "detergent", "dishwasher tablets", "finish tablets",
    "laundry powder", "laundry liquid", "washing powder", "fabric softener", "softener", "stain remover",
    "napisan", "bleach", "spray and wipe", "multipurpose spray", "glass cleaner", "windex", "sponges",
    "scourers", "chux", "cloths", "gloves", "rubber gloves", "bin liners", "garbage bags", "bin bags",
    "cling wrap", "glad wrap", "foil", "aluminium foil", "baking paper", "zip lock bags", "sandwich bags",
    "freezer bags", "batteries", "light globes", "globes", "candles", "matches", "air freshener",
    "toilet cleaner", "domestos", "mop", "broom", "insect spray", "mortein", "fly spray", "pegs",
    "ant killer", "surface spray", "disinfectant", "dettol", "pine o cleen", "oven cleaner",
    "rinse aid", "dishwasher salt", "vacuum bags", "lunch bags", "straws", "party supplies",
  ],
  Pet: [
    "dog food", "cat food", "pet food", "kibble", "dry food", "wet food", "dog treats", "cat treats",
    "kitty litter", "cat litter", "litter", "dog biscuits", "bird seed", "fish food", "pet",
    "whiskas", "pedigree", "optimum", "schmackos", "dog bones", "flea treatment", "worming",
  ],
};

type Entry = { phrase: string; aisle: string };

function normalise(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9&\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const ENTRIES: Entry[] = Object.entries(AISLE_KEYWORDS)
  .flatMap(([aisle, words]) => words.map((w) => ({ phrase: normalise(w).trim(), aisle })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

// Returns the aisle name for an item, or null if nothing matches.
export function aisleForName(name: string): string | null {
  const text = normalise(name);
  const singularText = ` ${text.trim().split(" ").map(singular).join(" ")} `;
  for (const { phrase, aisle } of ENTRIES) {
    const p = ` ${phrase} `;
    if (text.includes(p) || singularText.includes(p) || singularText.includes(` ${phrase.split(" ").map(singular).join(" ")} `)) {
      return aisle;
    }
  }
  return null;
}
