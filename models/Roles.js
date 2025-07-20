import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["admin","member", "editor", "viewer"], default: "viewer" },
    permissions: [{ type: String }], // Fine-grained permissions like "edit_tasks", "manage_members"
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Role", roleSchema);
