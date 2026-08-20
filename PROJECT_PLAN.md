# Choretle - A Chore Tracking App

## Main design
Choretle is an open-source, multi user chore and habit tracking app that is hosted in the cloud or on home servers. It allows group leaders (parents) to set tasks and assign them to group members (parents + children) and track their completion. Tasks should be worth a pre-determined number of points, with an option for the parents to award partial or bonus points. The app will allow parents to see how many tasks are complete per interval as well as automatically reward the children when tasks are complete.

## Data structure

- Tasks
  - Individual units of work
  - Cleraly defined objectives
  - Can have subtasks
  - Archtype for Jobs
- Subtasks
  - Sum of Subtasks' points equals Task total points
  - Can be checked off, not moved
- Slates
  - Arrays of Tasks with metadata
  - Metadata can include 
    - Duration of Slate (interval)
    - Can include default due date calculation for Slate 
    - Auto-generation schedule
  - Archtype for Lists
- Lists
  - Task Lists are generated when a Slate becomes valid for a Day or Week
  - Jobs/Subjobs are created from the Tasks on the Slate.
- Jobs
  - Created when a Task is assigned to a Slate
  - Default "Todo - Doing - Done" workflow
  - Displayed on cards in drag and drop
  - Inherit due date from Slate, but can override at Job level.
- Reports
  - A Todo Report is a Report of all Jobs that are Todo or In Progress for a user at the start of the day and scoring
    - Sort In-Progress items to the front
  - A Done Report is a Report of all Jobs that were finished in the previous day and scoring.
  - A Task Report is a Report of the times that a task was done, with notes.
  - A Member Report is a list of the items a member has completed
- Routine
  - Day of start of week
  - Lists to generate every Week
- Days
  - Days start at midnight local to the first user to sign up in a family
- Weeks
  - Weeks start on the day that is appropriate for the region
  At the start of the week, the app will look ahead to any slates that need to 
- Users
  - Can be admin (parent) or normal (child)
  - Admins can invite users to their family
- Teams  
  - Families can have multiple teams
  - Teams can compete against each other
- Swap Meet (Marketplace)
  - The marketplace is called "Swap Meet"
  - Parents can share their Slates to the Swap Meet

## Typical workflow

### Parents

- Sign up
  - First user signs up, can create org.
  - Becomes an admin of the org they created.
  - Can invite existing users.
    - Give them a code they can hand to net-new users
  - Can promote users to Admin.
  - Create Family name, logo, etc.
  - Toggle if teams are allowed
- Set up Users
  - Set permissions for Users group
    - Determine if Users are allowed to edit/delete Tasks or Jobs
- Set up Routine
  - Pick first day of week
  - Set up Slates
    - Offer sample Slates and Tasks
- Return later to collect reports
  - Daily
  - Reports should include a "wallboard" option

### Kids

- Sign up
  - Parent will invite
  - Becomes user in org parent created
  - Set name, pfp
  - Join team if available
- See routine
  - Visibility for next week of Lists
  - Visibility of Slate and Task details
  - Visibility of current Points Score
  - Move open Jobs through the workflow
  - Close open subtasks

## Views

- Dashboard
  - Overview
    - Outstanding jobs today
      - Include accommodations to advance in workflow
    - Five most recently completed jobs
    - Current Lists
    - Leaderboard
- User profile
  - Slates assigned to user
  - Lists assigned to user
  - Current score
- Task view
  - Name and details
  - Status change affordance
  - Comment section
  - History
- Job view
  - Truncated Task view used for Jobs
- Slate view
  - Owner (optional - can auto assign)
  - Room or Location  (optional)
  - Frequency and interval
- Rotation view
  - List of Users and Slates
  - Admins can match Users to Slates using drag and drop
    - This allows Users to be owners for speciific Tasks
  - Admins can make a sequenced list of Users and of Slates
    - A rotation interval is then defined.
    - At the interval, the list of Users is rotated to the next slate.
- Reports
  - Day at a glance
    - Current open/closed for last 24 hrs
      - Also aggregate numbers
      - Top three open Jobs
- Wallboard
  - Big cards for open Jobs
  - List of User/Slate mapping