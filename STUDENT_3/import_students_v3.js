const csv = require("csvtojson");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Alumni = require("../models/Alumni");
const moment = require("moment");

// 1) CONNECT TO MONGO
mongoose.connect("mongodb+srv://zoezischoolteam_db_user:2Ror7VvFrDoDEsgY@cluster0.ocwmygf.mongodb.net/Zoezi")
    .then(() => console.log("Mongo connected"))
    .catch(err => console.error(err));

// 2) ADMISSION NUMBER COUNTER
let counter = 500;
function generateAdmissionNumber() {
    counter++;
    return `DFS-${counter}-25`;
}

// SAFELY READ VALUE
const safe = (v) => (v && v.toString().trim() !== "" ? v.toString().trim() : "");

// CLEAN HEADER NAMES
function normalizeKeys(row) {
    const clean = {};
    Object.keys(row).forEach(k => {
        const cleanKey = k
            .trim()
            .replace(/\r?\n|\r/g, " ")   // remove newlines
            .replace(/\s+/g, " ")        // collapse spaces
            .replace(/:$/, "")           // remove trailing colon
            .replace(/\.+$/, "");        // remove trailing dots
        clean[cleanKey] = row[k];
    });
    return clean;
}

// DATE PARSER — supports all messy formats
function parseDate(d) {
    if (!d) return null;

    d = d.toString().trim();

    // Remove "st", "nd", "rd", "th"
    d = d.replace(/(\d+)(st|nd|rd|th)/gi, "$1");

    // Fix cases like "19 May2000" → "19 May 2000"
    d = d.replace(/([A-Za-z]+)(\d{4})/, "$1 $2");

    // Fix cases like "1985 /10/ 24" → "1985/10/24"
    d = d.replace(/\s+/g, " ").replace(/ \//g, "/").replace(/\/ /g, "/");

    const formats = [
        "DD/MM/YYYY", "D/M/YYYY",
        "DD-MM-YYYY", "D-M-YYYY",
        "DD.MM.YYYY", "D.M.YYYY",
        "YYYY/MM/DD", "YYYY/M/D",
        "MM/DD/YYYY", "M/D/YYYY",
        "DDMMYYYY", "DMMYYYY",
        "DD/MM/YY", "D/M/YY",
        "D MMM YYYY", "DD MMM YYYY",
        "D MMMM YYYY", "DD MMMM YYYY",
        "YYYY",
    ];

    const parsed = moment(d, formats, true);

    if (!parsed.isValid()) {
        console.log("❌ Invalid date found:", d);
        return null;
    }

    return parsed.toDate();
}

async function importCSV() {
    const students = await csv().fromFile("./students3.csv");
    const docs = [];

    for (const raw of students) {
        const s = normalizeKeys(raw);

        const email = safe(s["Email Address"]);
        if (!email) {
            console.log("❌ Skipping missing email:", s["Name of Student"]);
            continue;
        }

        // NAME SPLIT
        const fullName = safe(s["Name of Student"]);
        const [first, ...rest] = fullName.split(" ");
        const last = rest.join(" ") || "Unknown";

        // PHONE (take first if separated)
        let phone = safe(s["Student Phone Number"]);
        if (phone.includes("/") || phone.includes(",")) {
            phone = phone.split(/[\/,]/)[0].trim();
        }
        phone = phone.replace(/\s+/g, ""); // strip spaces

        console.log("Importing:", fullName, phone);

        const passwordToHash = phone || "123456";
        const hashedPassword = await bcrypt.hash(passwordToHash, 10);

        const doc = {
            firstName: first,
            lastName: last,
            email,
            phone,

            password: hashedPassword,

            dateOfBirth: parseDate(s["Date of Birth"]),

            admissionNumber: generateAdmissionNumber(),
            applicationRef: "",

            qualification: safe(s["Your highest academic level"]),
            course: safe(s["Course Name"]),
            trainingMode: safe(s["Mode of Training"]),

            preferredStartDate: "7 July 2025",
            startDate: new Date("2025-07-07"),

            citizenship: safe(s["Citizenship"]),
            idNumber: safe(s["ID number"]),
            kcseGrade: safe(s["KCSE GRADE or eqivalent"]),

            howHeardAbout: [safe(s["How did you get to know about this NZI course?"])],

            feePayer: "",
            feePayerPhone: "",

            nextOfKinName: safe(s["Next of Kin"]),
            nextOfKinPhone: safe(s["Next of Kin phone number"]),
            nextOfKinRelationship: safe(s["Relationship with Next of Kin"]),

            courseFee: 69450,
            upfrontFee: 69450,
            courseDuration: "6 months",

            exams: [
                { name: "Theory", score: "" },
                { name: "Practical", score: "" }
            ],

            status: "alumni",
            graduationDate: new Date(),

            verified: true,
            practiceStatus: "active",
            practicingSince: new Date("2025-12-06"),

            isPublicProfileEnabled: true,
            bio: "",
        };

        docs.push(doc);
    }

    await Alumni.insertMany(docs);
    console.log("✅ Imported:", docs.length);
    process.exit();
}

importCSV();
