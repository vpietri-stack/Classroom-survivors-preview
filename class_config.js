// CLASS_DAYS defines the order of days shown in the selection wizard
const CLASS_DAYS = ["周一", "周四", "周五", "周六", "周日", "其他老师的学生"];

/**
 *    Available content PU1:
    "PU1": {
    "0": [4, 5, 7, 8],
    "1": [9, 10, 11, 12, 13, 16],
    "2": [19, 20, 21, 22, 23, 26],
    "3": [31, 32, 33, 34, 35, 36, 37, 43],
    "4": [45, 47, 48, 54],
    "5": [66],
    "6": [78, 81],
    "7": [83, 85, 92],
    "8": [95, 97, 99],
    "9": [107, 108, 110, 111]
    },
    "PU2": {
    "0": [5],
    "1": [7, 9, 10, 16],
    "2": [19, 21, 22, 25],
    "3": [40, 43],
    "4": [45, 46, 47, 54],
    "5": [57, 66],
    "6": [78, 81],
    "7": [83, 85, 87, 93],
    "8": [95, 96, 104],
    "9": [107, 109, 116, 119]
    },
    "PU3": {
    "0": [5],
    "1": [16],
    "2": [28],
    "3": [40],
    "4": [54],
    "5": [57, 59, 66],
    "6": [69, 71, 73],
    "7": [83, 85, 87],
    "8": [95, 97, 98, 99],
    "9": [107, 109, 110, 111]
    },

    "Think0": {
    "0": [11],
    "1": [15, 17, 18],
    "2": [23]
    },  

    "Think1": {
    "0": [11],
    "1": [19],
    "2": [27],
    "3": [37],
    "4": [46],
    "5": [55],
    "6": [58, 64],
    "7": [66, 68, 69, 70]
    },

    "Think2": {
    "0": [11],
    "1": [19],
    "2": [29],
    "3": [37],
    "4": [47],
    "5": [55],
    "6": [65],
    "7": [73],
    "8": [83],
    "9": [91],
    "10": [101],
    "11": [109],
    "12": [119]
    }
 */

// CLASS_CONFIG organized by day -> time -> class data
const CLASS_CONFIG = {
    "周一": {
        "1810-1940": {
            students: ["Selena", "Nick", "Sean", "Sophie"],
            content: { book: "PU2", unit: "2", page: "25" }
        }
    },
    "周四": {
        "1810-1940": {
            students: ["Aaron", "Daniel", "Domi", "Jojo", "Lucky", "Simon"],
            content: { book: "PU1", unit: "4", page: "54" }
        }
    },
    "周五": {
        "1900-2030": {
            students: ["Colin", "Ethan", "Hollis", "Selena", "Sophia"],
            content: { book: "PU1", unit: "8", page: "99" }
        }
    },
    "周六": {
        "0900-1030": {
            students: ["Angel", "Loky", "Dylan", "Mia", "YaoYao", "Julia"],
            content: { book: "PU2", unit: "1", page: "7" }
        },
        "1040-1210": {
            students: ["Amy", "Annie", "Doris", "Harvey", "May", "Milk"],
            content: { book: "PU2", unit: "8", page: "97" }
        },
        "1310-1440": {
            students: ["Apple", "Lily", "Ryan", "Terry", "Toby"],
            content: { book: "Think1", unit: "7", page: "71" }
        },
        "1450-1620": {
            students: ["Gregory", "Max", "Sibyl"],
            content: { book: "Think2", unit: "7", page: "73" }
        },
        "1630-1800": {
            students: ["Coco", "Grayson", "Laura", "Leo", "Frank", "William"],
            content: { book: "Think0", unit: "2", page: "25" }
        },
        "1810-1940": {
            students: ["Annie", "Clarence", "Coco", "Gabriel", "Cody", "Ellie"],
            content: { book: "PU3", unit: "7", page: "83" }
        }
    },
    "周日": {
        "0900-1030": {
            students: ["Candy", "Joying", "Lucas", "Nina", "Rex", "Yoyo"],
            content: { book: "PU3", unit: "6", page: "69" }
        },
        "1040-1210": {
            students: ["Amber", "Cindy", "Gaby", "Kelly", "Susie"],
            content: { book: "Think1", unit: "7", page: "70" }
        },
        "1450-1620": {
            students: ["Dave", "Irene", "Mia", "Sylvia", "Leon", "Neal", "Zoe"],
            content: { book: "PU2", unit: "5", page: "62" }
        },
        "1630-1800": {
            students: ["James", "Jenny", "Koey", "Minnie", "Mia", "Pudding"],
            content: { book: "PU3", unit: "0", page: "5" }
        },
        "1810-1940": {
            students: ["Andy", "Iris", "Ivan", "Ruly", "Zozo", "Doris"],
            content: { book: "PU1", unit: "2", page: "21" }
        }
    }
};
