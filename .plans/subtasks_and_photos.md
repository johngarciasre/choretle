# Implement new features

- Subtask tracking
- Photos upload
- Review gate

## Subtask tracking

- Subtasks can be attached to Jobs or Tasks.
- When a Job is created from a Task on a Slate, also duplicate the Subjobs that are owned by the Job
- Subjobs are components of a Job that are part of the Job.
- Admins can optionally set a minimum number or portion of Subtasks to consider a Job complete.

## Photos upload

- Users must be able to upload profile photos
- Users must be able to attach a photo to any Object to act as a hero
- Tasks and Jobs must accept upload of probative (provides proof) photos.
- Allow (optional) users to give the photos titles
- Provide a carousel for photo review in the Job view

## Review gate

- Tasks and Jobs can be marked as `Verify`
- `Verify` setting acts as a review gate when the Job is marked Done by the user
- Gated items will be moved to an "Under Review" status
- Admins will have a "review queue" where they can quickly manage reviews
- Reviews will highlight the photos attached to the Job
- When Jobs are created, they can inherit the `Verify` trait from their parent
- `Verify` trait can be added or removed from any Job by an Admin even if it is inherited.
