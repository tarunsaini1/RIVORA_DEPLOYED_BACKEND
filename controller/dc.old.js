import Project from '../models/Project.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import { Invitation } from '../models/Invitation.js';
import { sendInvitationEmail } from '../utils/sendEmail.js';

/**
 * Deploy a team to a project by sending invitations to all members
 * @route POST /api/teams/:teamId/deploy/:projectId
 * @access Private (Team owner only)
 */
export const deployTeamToProject = async (req, res) => {
  try {
    const { teamId, projectId } = req.params;
    const { role = "member", message = "" } = req.body;
    const userId = req.user._id;

    // Validate role based on Project schema's enum values
    if (!["admin", "member", "viewer"].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid role. Must be admin, member, or viewer"
      });
    }

    // Find the team and check if user is the owner
    const team = await Team.findById(teamId)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!team) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    // Check if user is team owner
    if (team.owner._id.toString() !== userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: "Only team owner can deploy the team to projects" 
      });
    }

    // Find the project and check if it exists
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    // Check if user is project owner or admin
    const isProjectOwner = project.owner.toString() === userId.toString();
    
    // Find if the user is a project member with admin role
    const projectMember = project.members.find(m => 
      m.userId && m.userId.toString() === userId.toString()
    );
    
    const isProjectAdmin = projectMember && projectMember.role === 'admin';
    
    // Determine if the user can invite others
    const canInvite = isProjectOwner || isProjectAdmin;
    
    if (!canInvite) {
      return res.status(403).json({ 
        success: false, 
        message: "You don't have permission to invite members to this project" 
      });
    }

    // Get all team members excluding the current user
    const teamMembers = team.members.filter(member => 
      member.user && member.user._id.toString() !== userId.toString()
    );

    // Add the team owner if they're not the current user
    if (team.owner._id.toString() !== userId.toString()) {
      teamMembers.unshift({ user: team.owner });
    }

    // Track successful invitations
    const successfulInvitations = [];
    const failedInvitations = [];

    // Process each team member - create invitation and update user document
    for (const member of teamMembers) {
      try {
        // Skip if user doesn't have an email
        if (!member.user || !member.user.email) {
          console.log("Skipping member without email:", member);
          continue;
        }

        // Create a new invitation document
        const invitation = new Invitation({
          projectId,
          inviterId: userId,
          inviteeEmail: member.user.email,
          role,
          message,
          status: "pending",
          teamDeployment: true, // Mark this as team deployment
          teamId: teamId // Store team reference
        });
        await invitation.save();

        // Find the user by email and update their invitations array
        const inviteeUser = await User.findOne({ email: member.user.email });
        
        if (inviteeUser) {
          // Add to user's invitations array
          await User.findByIdAndUpdate(inviteeUser._id, {
            $push: {
              invitations: {
                invitationId: invitation._id,
                inviterId: userId,
                projectId: projectId,
                role: role,
                status: "pending",
                sentAt: new Date(),
                message: message,
                teamDeployment: true // Mark as team deployment for tracking
              }
            }
          });
        } else {
          console.log(`User not found for email ${member.user.email}, but invitation created`);
        }

        // Try to send email
        try {
          await sendInvitationEmail({
            recipientEmail: member.user.email,
            recipientName: member.user.name || member.user.email,
            inviterName: req.user.name || "A project administrator",
            projectName: project.name,
            role,
            message,
            invitationLink: `${process.env.FRONTEND_URL}/projects/invitations`
          });
        } catch (emailError) {
          console.error(`Failed to send invitation email to ${member.user.email}:`, emailError);
          // Continue with other invitations even if email fails
        }

        // Track successful invitation
        successfulInvitations.push({
          id: invitation._id,
          email: member.user.email,
          userId: inviteeUser?._id,
          userFound: !!inviteeUser
        });

      } catch (invError) {
        console.error(`Failed to process invitation for ${member.user?.email || 'unknown user'}:`, invError);
        failedInvitations.push({
          email: member.user?.email,
          error: invError.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Team deployment initiated. ${successfulInvitations.length} invitations sent.`,
      details: {
        successful: successfulInvitations.length,
        failed: failedInvitations.length,
        invitations: successfulInvitations
      }
    });

  } catch (error) {
    console.error("Error deploying team to project:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to deploy team to project", 
      error: error.message 
    });
  }
};

/**
 * Get projects where the team has been deployed
 * @route GET /api/teams/:teamId/deployments
 * @access Private (Team members)
 */
export const getTeamDeployments = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user._id;

    // Find the team
    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({ success: false, message: "Team not found" });
    }

    // Check if user is team owner or member
    const isMember = team.owner.toString() === userId.toString() || 
                    team.members.some(m => m.user.toString() === userId.toString());

    if (!isMember) {
      return res.status(403).json({ 
        success: false, 
        message: "Only team members can view team deployments" 
      });
    }

    // Get all team members including owner
    const teamMemberIds = [
      team.owner.toString(),
      ...team.members.map(m => m.user.toString())
    ];

    // Find all projects where team members are also project members
    const projects = await Project.find({
      $or: [
        { owner: { $in: teamMemberIds } },
        { 'members.user': { $in: teamMemberIds } }
      ]
    })
    .populate('owner', 'name email profilePicture')
    .populate('members.user', 'name email profilePicture');

    // Find all pending invitations for team members
    const pendingInvitations = await Invitation.find({
      inviteeEmail: { $in: teamMemberIds.map(id => id.email) }, // This requires additional logic to get emails
      status: "pending"
    })
    .populate('projectId', 'name description');

    res.status(200).json({
      success: true,
      deployments: {
        activeProjects: projects,
        pendingInvitations
      }
    });

  } catch (error) {
    console.error("Error fetching team deployments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch team deployments", error: error.message });
  }
};