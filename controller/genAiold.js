import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { Task } from "../models/TaskModel.js";
import  Subtask  from "../models/SubTask.js";
import Project from "../models/Project.js";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const generateAITasks = async (projectId, projectName, projectDescription, teamMembers, projectDeadline, createdBy) => {
    try {
        const model = genAI.getGenerativeModel({model:"gemini-1.5-pro"});

        const prompt = `
              Generate up to 8 structured tasks for the following project:
              - Project Name: ${projectName}
              - Description: ${projectDescription}
              - Number of Team Members: ${teamMembers.length}
              - Deadline: ${projectDeadline}

              Each task should include:
              - Title
              - Description
              - Estimated time in hours
              - Suggested due date (in days from today)
              - Up to 3 sub-tasks

              Response Format (JSON Array):
              [
                {
                    "title": "Task Title",
                    "description": "Detailed Description",
                    "estimatedTime": 4,
                    "suggestedDueDate": 3,
                     "subtasks": [
                        { "title": "Subtask 1" },
                        { "title": "Subtask 2" }
                    ]
                
                }
              ]
        `

        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        let aiTasks = []; // Define aiTasks in the outer scope

        // JSON extraction and parsing
        try {
            let jsonStr = responseText;
            const startIdx = responseText.indexOf('[');
            const endIdx = responseText.lastIndexOf(']') + 1;
            
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = responseText.substring(startIdx, endIdx);
            }

            jsonStr = jsonStr.trim();
            aiTasks = JSON.parse(jsonStr); // Assign to outer scope variable

            if (!Array.isArray(aiTasks)) {
                throw new Error('Response is not an array');
            }

            console.log("Successfully parsed AI Tasks:", aiTasks);
        } catch (jsonError) {
            console.error("JSON Parsing Error:", jsonError);
            console.error("Raw Response:", responseText);
            return null;
        }

        const createdTasks = [];

        for (const aiTask of aiTasks) {
            let suggestedDueDate = Math.max(aiTask.suggestedDueDate, Math.ceil(aiTask.estimatedTime / 24));
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + suggestedDueDate);

            // First create the main task
            const newTask = new Task({
                title: aiTask.title,
                description: aiTask.description,
                estimatedTime: aiTask.estimatedTime,
                dueDate,
                projectId,
                createdBy,
                assignedBy: createdBy,
                subtasks: [], // Initialize empty, will be updated later
                aiGenerated: true,
                status: 'todo'
            });

            await newTask.save();

            // Then create subtasks with the parent task ID
            const createdSubtasks = aiTask.subtasks ? await Promise.all(
                aiTask.subtasks.map(async (sub) => {
                    const newSubtask = new Subtask({
                        title: sub.title,
                        parentTask: newTask._id, // Set parent task ID immediately
                    });
                    await newSubtask.save();
                    return newSubtask._id;
                })
            ) : [];

            // Update the main task with subtask references
            if (createdSubtasks.length > 0) {
                await Task.findByIdAndUpdate(
                    newTask._id,
                    { $set: { subtasks: createdSubtasks } }
                );
            }

            createdTasks.push(newTask);
        }

        await Project.findByIdAndUpdate(
            projectId,
            { 
                $push: { 
                    tasks: { 
                        $each: createdTasks.map(task => task._id) 
                    } 
                } 
            }
        );

        return createdTasks;

    } catch(err) {
        console.error(err);
        console.error("AI Task Generation Failed");
        return [];
    }
};