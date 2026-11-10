import { collections, type Assignment } from "./db.js";
import { ObjectId } from "mongodb";

export type AssignResult =
  | { kind: "assigned"; assignment: Assignment }
  | { kind: "judge-busy" } // the judge already holds a QUEUED assignment
  | { kind: "none-available" }; // no project is eligible for this judge right now

/**
 * TODO: implement. See the README for the rules.
 *
 * `judgeId` is already validated to exist by the route. Use `collections()` from ./db.js.
 * Add any helpers you need.
 */
export async function assignNext(judgeId: string): Promise<AssignResult> {

  //check if judge already has a queued assignment
  const queuedAssignment = await collections().assignments.findOne({
    judgeId: judgeId,
    status: "QUEUED"
  });

  if (queuedAssignment) {
    return { kind: "judge-busy" };
  }

  //get all prev assignments for this judge
  const prevAssignments = await collections().assignments.find({
    judgeId: judgeId
  }).toArray();

   //get IDs of projects previously assigned to this judge
  const prevProjectIds = prevAssignments.map(
    assignment => assignment.projectId
  );

  //get all projects that currently have a queued assignment
  const queuedAssignments = await collections().assignments.find({
    status: "QUEUED"
  }).toArray();

  const queuedProjectIds = queuedAssignments.map(
    assignment => assignment.projectId
  );

  //get all projects
  const projects = await collections().projects.find().toArray();

  //exclude previously assigned & currently queued projects
  const availableProjects = projects.filter(project =>
    !prevProjectIds.includes(project._id) &&
    !queuedProjectIds.includes(project._id)
  );

  //check if any projects are available
  if (availableProjects.length === 0) {
    return { kind: "none-available" };
  }

  //get all completed assignments
  const completedAssignments = await collections().assignments.find({
    status: "COMPLETED"
  }).toArray();

  //find fewest completed assignments among available projects
  let minCompleted = Infinity;
  let candidates: typeof availableProjects = [];

  for (const project of availableProjects) {
    const completedCount = completedAssignments.filter(
      assignment => assignment.projectId === project._id
    ).length;

    if (completedCount < minCompleted) {
      minCompleted = completedCount;
      candidates = [project];
    } else if (completedCount === minCompleted) {
      candidates.push(project);
    }
  }

  // randomly select a project among those tied for fewest completions
  const randomIndex = Math.floor(Math.random() * candidates.length);
  const selectedProject = candidates[randomIndex];

  // create a new queued assignment
  const newAssignment: Assignment = {
    _id: new ObjectId(),
    judgeId: judgeId,
    projectId: selectedProject._id,
    status: "QUEUED",
    createdAt: new Date()
  };

  await collections().assignments.insertOne(newAssignment);

  return { kind: "assigned", assignment: newAssignment };
}
