const csv = require("csvtojson");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Alumni = require("../models/Alumni");

// 1) CONNECT TO MONGO
mongoose.connect("mongodb+srv://zoezischoolteam_db_user:2Ror7VvFrDoDEsgY@cluster0.ocwmygf.mongodb.net/Zoezi")
    .then(() => console.log("Mongo connected"))
    .catch(err => console.error(err));

// 2) GENERATE ADMISSION NUMBER
let counter = 2; // starting index, adjust

function generateAdmissionNumber() {
    counter++;
    return `DFS-${counter}-25`;
}

// 3) MAIN IMPORT
async function importCSV() {
    const students = await csv().fromFile("./students.csv");

    const docs = [];

    function normalizeKeys(row) {
        const clean = {};
        Object.keys(row).forEach(k => {
            clean[k.trim().replace(/\.+$/, "")] = row[k];  // remove spaces + trailing dots
        });
        return clean;
    }


    for (const raw of students) {
        const s = normalizeKeys(raw);

        if (!s["Email Address"] || s["Email Address"].trim() === "") {
            console.log("❌ Skipping missing email:", s["Your Name"]);
            continue;
        }

        const fullName = (s["Your Name"] || "").trim();
        const [first, ...rest] = fullName.split(" ");
        const last = rest.join(" ") || "Unknown";

        const phone = (s["Student Phone Number"] || "").toString().trim();

        console.log("Importing:", fullName, phone);

        const passwordToHash = phone || "123456"; // fallback
        const hashedPassword = await bcrypt.hash(passwordToHash, 10);

        const doc = {
            firstName: first || "",
            lastName: last || "",
            email: s["Email Address"] || "",
            phone: phone || "",
            password: hashedPassword,
            dateOfBirth: s["Date of Birth"] ? new Date(s["Date of Birth"]) : null,

            admissionNumber: generateAdmissionNumber(),
            applicationRef: "",

            qualification: s["Your highest academic level"] || "",
            course: s["The Course you're applying for"] || "",
            trainingMode: s["Mode of Training"] || "",
            preferredStartDate: "7 July 2025",
            startDate: new Date("2025-07-07"),

            citizenship: s["Citizenship"] || "",
            idNumber: s["ID (Passport) Number"] || "",
            kcseGrade: s["KCSE grade or equivalent"] || "",

            howHeardAbout: [s["How did your learn about this NZI course?"] || ""],
            feePayer: s["Fee paid by"] || "",
            feePayerPhone: s["Fee Payer phone number"] || "",

            nextOfKinName: s["Next of kin"] || "",
            nextOfKinPhone: s["Next of kin phone number"] || "",
            nextOfKinRelationship: s["Relationship with next of kin"] || "",

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
