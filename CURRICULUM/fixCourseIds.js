const mongoose = require("mongoose");
const Curriculum = require("../models/Curriculum");
const Course = require("../models/Course");

// 1) CONNECT TO MONGO
mongoose.connect("mongodb+srv://zoezischoolteam_db_user:2Ror7VvFrDoDEsgY@cluster0.ocwmygf.mongodb.net/Zoezi")
    .then(() => console.log("✅ Mongo connected"))
    .catch(err => console.error("❌ Mongo error:", err));

// 2) FUZZY STRING MATCHING (Levenshtein Distance)
function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() =>
        Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) {
        track[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
        track[j][0] = j;
    }
    for (let j = 1; j <= str2.length; j += 1) {
        for (let i = 1; i <= str1.length; i += 1) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }
    return track[str2.length][str1.length];
}

function calculateSimilarity(str1, str2) {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 100;
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return ((maxLen - distance) / maxLen) * 100;
}

// 3) MAIN MIGRATION
async function fixCourseIds() {
    try {
        const curriculums = await Curriculum.find();
        const courses = await Course.find({ active: true });

        console.log(`\n📊 Found ${curriculums.length} curriculums and ${courses.length} courses\n`);

        let matched = 0;
        let unmatched = 0;
        const results = [];

        for (const curriculum of curriculums) {
            const currName = curriculum.courseName || "";
            if (!currName.trim()) {
                console.log("⚠️  Skipping curriculum with empty courseName:", curriculum._id);
                continue;
            }

            // Find best matching course
            let bestMatch = null;
            let bestScore = 0;

            for (const course of courses) {
                const similarity = calculateSimilarity(currName, course.name);
                if (similarity > bestScore) {
                    bestScore = similarity;
                    bestMatch = course;
                }
            }

            // Update if similarity > 70%
            if (bestScore > 70 && bestMatch) {
                const oldCourseId = curriculum.courseId?.toString() || "null";
                const newCourseId = bestMatch._id.toString();

                if (oldCourseId !== newCourseId) {
                    await Curriculum.updateOne(
                        { _id: curriculum._id },
                        { courseId: bestMatch._id }
                    );
                    matched++;
                    results.push({
                        curriculumId: curriculum._id,
                        curriculumName: currName,
                        matchedCourseName: bestMatch.name,
                        oldCourseId: oldCourseId,
                        newCourseId: newCourseId,
                        similarity: bestScore.toFixed(2) + "%",
                        status: "✅ Updated"
                    });
                    console.log(`✅ Updated: "${currName}" → "${bestMatch.name}" (${bestScore.toFixed(2)}%)`);
                } else {
                    console.log(`ℹ️  Already correct: "${currName}"`);
                    matched++;
                }
            } else {
                unmatched++;
                results.push({
                    curriculumId: curriculum._id,
                    curriculumName: currName,
                    bestMatchAttempt: bestMatch?.name || "No match",
                    bestScore: bestScore.toFixed(2) + "%",
                    status: "❌ No match (< 70%)"
                });
                console.log(`❌ No match found: "${currName}" (best: ${bestScore.toFixed(2)}%)`);
            }
        }

        console.log("\n" + "=".repeat(60));
        console.log(`✅ Matched & Updated: ${matched}`);
        console.log(`❌ Unmatched: ${unmatched}`);
        console.log(`📊 Total Processed: ${matched + unmatched}`);
        console.log("=".repeat(60) + "\n");

        if (unmatched > 0) {
            console.log("⚠️  Unmatched curriculums (requires manual review):\n");
            results
                .filter(r => r.status.includes("❌"))
                .forEach(r => {
                    console.log(`  - ${r.curriculumName} (${r.bestScore})`);
                });
        }

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

fixCourseIds();
