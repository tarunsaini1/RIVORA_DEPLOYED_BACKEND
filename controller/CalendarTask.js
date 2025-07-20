import Team from '../models/Team.js';
import TeamEvent from '../models/Calendar.js';
import mongoose from 'mongoose';

// Get all events for a team
export const getTeamEvents = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { start, end } = req.query;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member of the team
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Build query
    const query = { team: teamId };
    
    // Filter by date range if provided
    if (start && end) {
      query.$or = [
        { startDate: { $gte: new Date(start), $lte: new Date(end) } },
        { endDate: { $gte: new Date(start), $lte: new Date(end) } },
        {
          $and: [
            { startDate: { $lte: new Date(start) } },
            { endDate: { $gte: new Date(end) } }
          ]
        }
      ];
    }
    
    // Fetch events
    const events = await TeamEvent.find(query)
      .populate('createdBy', 'name email avatar')
      .populate('attendees.user', 'name email avatar')
      .sort({ startDate: 1 });
    
    res.status(200).json(events);
  } catch (error) {
    console.error('Error fetching team events:', error);
    res.status(500).json({ message: 'Failed to fetch team events', error: error.message });
  }
};

// Create a new event
export const createTeamEvent = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { title, description, location, startDate, endDate, allDay, color, attendeeIds } = req.body;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member of the team
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Create attendees array
    const attendees = [];
    if (attendeeIds && attendeeIds.length) {
      for (const userId of attendeeIds) {
        // Check if user is in the team
        const isTeamMember = team.members.some(member => 
          member.user.toString() === userId
        ) || team.owner.toString() === userId;
        
        if (isTeamMember) {
          attendees.push({
            user: userId,
            status: userId === req.user._id.toString() ? 'accepted' : 'pending'
          });
        }
      }
    }
    
    // Create event
    const newEvent = new TeamEvent({
      team: teamId,
      title,
      description,
      location,
      startDate,
      endDate,
      allDay,
      color,
      attendees,
      createdBy: req.user._id
    });
    
    await newEvent.save();
    
    // Populate creator and attendee details
    await newEvent.populate('createdBy', 'name email avatar');
    await newEvent.populate('attendees.user', 'name email avatar');
    
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error creating team event:', error);
    res.status(500).json({ message: 'Failed to create team event', error: error.message });
  }
};

// Update an event
export const updateTeamEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const updateData = req.body;
    
    // Find the event
    const event = await TeamEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check permissions
    const team = await Team.findById(event.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Only creator or team owner can update the event
    const canEdit = 
      event.createdBy.toString() === req.user._id.toString() || 
      team.owner.toString() === req.user._id.toString();
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You do not have permission to update this event' });
    }
    
    // Handle attendee updates
    if (updateData.attendeeIds) {
      const attendees = [];
      
      for (const userId of updateData.attendeeIds) {
        // Check if user is in the team
        const isTeamMember = team.members.some(member => 
          member.user.toString() === userId
        ) || team.owner.toString() === userId;
        
        if (isTeamMember) {
          // Preserve existing status if attendee already exists
          const existingAttendee = event.attendees.find(att => 
            att.user.toString() === userId
          );
          
          attendees.push({
            user: userId,
            status: existingAttendee ? existingAttendee.status : 'pending'
          });
        }
      }
      
      updateData.attendees = attendees;
      delete updateData.attendeeIds;
    }
    
    // Update the event
    updateData.updatedBy = req.user._id;
    
    const updatedEvent = await TeamEvent.findByIdAndUpdate(
      eventId,
      updateData,
      { new: true }
    )
    .populate('createdBy', 'name email avatar')
    .populate('attendees.user', 'name email avatar')
    .populate('updatedBy', 'name email avatar');
    
    res.status(200).json(updatedEvent);
  } catch (error) {
    console.error('Error updating team event:', error);
    res.status(500).json({ message: 'Failed to update team event', error: error.message });
  }
};

// Delete an event
export const deleteTeamEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Find the event
    const event = await TeamEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check permissions
    const team = await Team.findById(event.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Only creator or team owner can delete the event
    const canDelete = 
      event.createdBy.toString() === req.user._id.toString() || 
      team.owner.toString() === req.user._id.toString();
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You do not have permission to delete this event' });
    }
    
    // Delete the event
    await TeamEvent.findByIdAndDelete(eventId);
    
    res.status(200).json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting team event:', error);
    res.status(500).json({ message: 'Failed to delete team event', error: error.message });
  }
};

// Update attendee status
export const updateAttendeeStatus = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ message: 'Invalid attendance status' });
    }
    
    // Find the event
    const event = await TeamEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if user is an attendee
    const attendeeIndex = event.attendees.findIndex(att => 
      att.user.toString() === req.user._id.toString()
    );
    
    if (attendeeIndex === -1) {
      return res.status(403).json({ message: 'You are not an attendee of this event' });
    }
    
    // Update attendance status
    event.attendees[attendeeIndex].status = status;
    await event.save();
    
    // Return updated event
    await event.populate('createdBy', 'name email avatar');
    await event.populate('attendees.user', 'name email avatar');
    
    res.status(200).json(event);
  } catch (error) {
    console.error('Error updating attendee status:', error);
    res.status(500).json({ message: 'Failed to update attendee status', error: error.message });
  }
};