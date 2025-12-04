const csv = require("csvtojson");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Alumni = require("../models/Alumni");
const moment = require("moment");

// 1) CONNECT TO MONGO
mongoose.connect("mongodb+srv://zoezischoolteam_db_user:2Ror7VvFrDoDEsgY@cluster0.ocwmygf.mongodb.net/Zoezi")
    .then(() => console.log("Mongo connected"))
    .catch(err => console.error(err));

// 2) GENERATE ADMISSION NUMBER
let counter = 200; // adjust if needed

function generateAdmissionNumber() {
    counter++;
    return `DFS-${counter}-25`;
}

// SAFELY READ VALUE
const safe = (v) => (v && v.toString().trim() !== "" ? v.toString().trim() : "");

// 3) MAIN IMPORT
async function importCSV() {
    const students = await csv().fromFile("./students2.csv");

    const docs = [];

    function normalizeKeys(row) {
        const clean = {};
        Object.keys(row).forEach(k => {
            clean[k.trim().replace(/\.+$/, "")] = row[k];
        });
        return clean;
    }



    function parseDate(d) {
        if (!d) return null;

        // Remove odd characters (like "th", "st", "nd", etc.)
        d = d.replace(/(\d+)(st|nd|rd|th)/gi, "$1");

        // All formats we want to support:
        const formats = [
            "DD/MM/YYYY",
            "D/M/YYYY",
            "DD.MM.YYYY",
            "D.M.YYYY",
            "DD-MM-YYYY",
            "D-M-YYYY",
            "YYYY/MM/DD",
            "YYYY/M/D",
            "MM/DD/YYYY",
            "M/D/YYYY",
            "D MMM YYYY",
            "DD MMM YYYY",
            "YYYY",
            "DDMMYYYY",
            "DMMYYYY",
            "DD/MM/YY",
            "D/M/YY"
        ];

        const parsed = moment(d, formats, true);

        if (!parsed.isValid()) {
            console.log("❌ Invalid date found:", d);
            return null; // or skip the record
        }

        return parsed.toDate();
    }



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

        // PHONE
        const phoneRaw = safe(s["Student Phone Number"]);
        const phone = phoneRaw.includes("/") ? phoneRaw.split("/")[0].trim() : phoneRaw;

        console.log("Importing:", fullName, phone);

        const passwordToHash = phone || "123456";
        const hashedPassword = await bcrypt.hash(passwordToHash, 10);

        const doc = {
            firstName: first,
            lastName: last,
            email: email,
            phone: phone,

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

            courseFee: 7450,
            upfrontFee: 7450,
            courseDuration: "6 months",

            exams: [
                { name: "Theory", score: "Distinction" },
                { name: "Practical", score: "Distinction" }
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
    console.log("Imported:", docs.length);
    process.exit();
}

importCSV();