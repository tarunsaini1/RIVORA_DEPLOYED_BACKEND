import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true 
    },
    projectId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Project", 
      required: true 
    },
    description: { 
      type: String, 
      default: "" 
    },
    members: [{
      userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
      },
      role: { 
        type: String, 
        enum: ["admin", "member"], 
        default: "member" 
      },
      joinedAt: { 
        type: Date, 
        default: Date.now 
      }
    }],
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    lastMessage: {
      content: String,
      sender: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
      },
      timestamp: { 
        type: Date, 
        default: Date.now 
      }
    },
    isArchived: { 
      type: Boolean, 
      default: false 
    },
    isDefault: {
        type: Boolean,
        default: false
    },
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("Group", groupSchema);