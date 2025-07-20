const inviter = await User.findById(req.user._id).select('name username');
        
        await notificationService.createNotification({
            recipientId: userId,
            type: 'project_invite',
            title: 'New Project Invitation',
            content: `${inviter.name} has invited you to join project "${project.name}" as ${role}`,
            senderId: req.user._id,
            entityType: 'project',
            entityId: projectId,
            actionUrl: `/projects/invites`,
            metaData: {
                invitationId: invitation._id,
                role: role,
                message: message || '',
                projectName: project.name
            }
        });