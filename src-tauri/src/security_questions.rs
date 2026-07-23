use crate::models::SecurityQuestion;

/// Library of 100+ security questions organized by category
pub fn get_security_questions_library() -> Vec<SecurityQuestion> {
    vec![
    // Childhood & Early Life
    SecurityQuestion {
        id: "childhood_city".to_string(),
        question: "What city were you born in?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_school".to_string(),
        question: "What was the name of your first elementary school?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_friend".to_string(),
        question: "What was the name of your childhood best friend?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_pet".to_string(),
        question: "What was the name of your first pet?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_nickname".to_string(),
        question: "What was your childhood nickname?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_street".to_string(),
        question: "What street did you grow up on?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_teacher".to_string(),
        question: "What was the name of your favorite elementary school teacher?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_game".to_string(),
        question: "What was your favorite childhood game?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_toy".to_string(),
        question: "What was your favorite childhood toy?".to_string(),
        category: "Childhood".to_string(),
    },
    SecurityQuestion {
        id: "childhood_holiday".to_string(),
        question: "Where did you go for your first family vacation?".to_string(),
        category: "Childhood".to_string(),
    },

    // Family
    SecurityQuestion {
        id: "family_mother_maiden".to_string(),
        question: "What is your mother's maiden name?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_father_middle".to_string(),
        question: "What is your father's middle name?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_grandfather".to_string(),
        question: "What was your grandfather's first name?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_grandmother".to_string(),
        question: "What was your grandmother's first name?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_sibling".to_string(),
        question: "What is your oldest sibling's middle name?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_cousin".to_string(),
        question: "What city does your oldest cousin live in?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_tradition".to_string(),
        question: "What is a family tradition you still practice?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_reunion".to_string(),
        question: "Where was your last family reunion held?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_recipe".to_string(),
        question: "What is a family recipe that has been passed down?".to_string(),
        category: "Family".to_string(),
    },
    SecurityQuestion {
        id: "family_heirloom".to_string(),
        question: "What family heirloom do you cherish most?".to_string(),
        category: "Family".to_string(),
    },

    // Education
    SecurityQuestion {
        id: "education_highschool".to_string(),
        question: "What year did you graduate high school?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_college".to_string(),
        question: "What was your college major?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_professor".to_string(),
        question: "What was the name of your favorite college professor?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_dorm".to_string(),
        question: "What was the name of your college dorm?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_first_job".to_string(),
        question: "What was your first job after graduation?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_subject".to_string(),
        question: "What was your favorite subject in high school?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_club".to_string(),
        question: "What school club or organization were you part of?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_sport".to_string(),
        question: "What sport did you play in school?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_scholarship".to_string(),
        question: "Did you receive any scholarships? If so, for what?".to_string(),
        category: "Education".to_string(),
    },
    SecurityQuestion {
        id: "education_graduation".to_string(),
        question: "Where did you go to celebrate your graduation?".to_string(),
        category: "Education".to_string(),
    },

    // Work & Career
    SecurityQuestion {
        id: "work_first_company".to_string(),
        question: "What was the name of your first employer?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_first_salary".to_string(),
        question: "What was your first hourly wage?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_first_boss".to_string(),
        question: "What was the name of your first supervisor?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_first_desk".to_string(),
        question: "What was your desk number or location at your first job?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_first_project".to_string(),
        question: "What was the first project you worked on?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_promotion".to_string(),
        question: "What year did you get your first promotion?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_colleague".to_string(),
        question: "What was the name of your first work best friend?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_training".to_string(),
        question: "What was your first professional training course?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_award".to_string(),
        question: "What was the first award you received at work?".to_string(),
        category: "Work".to_string(),
    },
    SecurityQuestion {
        id: "work_conference".to_string(),
        question: "What was the first conference you attended?".to_string(),
        category: "Work".to_string(),
    },

    // Relationships
    SecurityQuestion {
        id: "relationship_first_date".to_string(),
        question: "Where did you go on your first date?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_first_kiss".to_string(),
        question: "Where did you have your first kiss?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_first_crush".to_string(),
        question: "What was the name of your first crush?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_wedding".to_string(),
        question: "Where did you get married?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_anniversary".to_string(),
        question: "What month is your anniversary?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_proposal".to_string(),
        question: "Where were you when you got engaged?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_meet_spouse".to_string(),
        question: "Where did you meet your spouse?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_honeymoon".to_string(),
        question: "Where did you go for your honeymoon?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_first_child".to_string(),
        question: "What hospital was your first child born in?".to_string(),
        category: "Relationships".to_string(),
    },
    SecurityQuestion {
        id: "relationship_first_home".to_string(),
        question: "What year did you buy your first home?".to_string(),
        category: "Relationships".to_string(),
    },

    // Favorites & Preferences
    SecurityQuestion {
        id: "favorite_movie".to_string(),
        question: "What is your all-time favorite movie?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_book".to_string(),
        question: "What is your favorite book?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_song".to_string(),
        question: "What is your favorite song?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_band".to_string(),
        question: "What is your favorite band or artist?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_food".to_string(),
        question: "What is your favorite food?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_restaurant".to_string(),
        question: "What is your favorite restaurant?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_sport".to_string(),
        question: "What is your favorite sport to watch?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_team".to_string(),
        question: "What is your favorite sports team?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_color".to_string(),
        question: "What is your favorite color?".to_string(),
        category: "Favorites".to_string(),
    },
    SecurityQuestion {
        id: "favorite_season".to_string(),
        question: "What is your favorite season?".to_string(),
        category: "Favorites".to_string(),
    },

    // Travel & Places
    SecurityQuestion {
        id: "travel_first_plane".to_string(),
        question: "Where did you go on your first airplane trip?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_first_foreign".to_string(),
        question: "What was your first foreign country visited?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_favorite_city".to_string(),
        question: "What is your favorite city to visit?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_dream_destination".to_string(),
        question: "What is your dream travel destination?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_cruise".to_string(),
        question: "What cruise have you been on?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_camping".to_string(),
        question: "Where was your first camping trip?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_roadtrip".to_string(),
        question: "What was your longest road trip destination?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_beach".to_string(),
        question: "What beach do you visit most often?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_mountain".to_string(),
        question: "What mountain have you climbed?".to_string(),
        category: "Travel".to_string(),
    },
    SecurityQuestion {
        id: "travel_theme_park".to_string(),
        question: "What theme park did you visit last?".to_string(),
        category: "Travel".to_string(),
    },

    // Vehicles
    SecurityQuestion {
        id: "vehicle_first_car".to_string(),
        question: "What was the make and model of your first car?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_first_lesson".to_string(),
        question: "Where did you take your first driving lesson?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_license".to_string(),
        question: "What year did you get your driver's license?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_accident".to_string(),
        question: "What year was your first car accident?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_motorcycle".to_string(),
        question: "Have you ever owned a motorcycle? What brand?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_boat".to_string(),
        question: "Have you ever owned a boat? What type?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_rv".to_string(),
        question: "Have you ever traveled in an RV? Where?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_bicycle".to_string(),
        question: "What brand was your first bicycle?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_current".to_string(),
        question: "What is your current vehicle's color?".to_string(),
        category: "Vehicles".to_string(),
    },
    SecurityQuestion {
        id: "vehicle_license_plate".to_string(),
        question: "What were the first 3 letters of your first license plate?".to_string(),
        category: "Vehicles".to_string(),
    },

    // Technology
    SecurityQuestion {
        id: "tech_first_computer".to_string(),
        question: "What was your first computer brand?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_phone".to_string(),
        question: "What was your first mobile phone?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_email".to_string(),
        question: "What was your first email address provider?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_social".to_string(),
        question: "What was your first social media platform?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_game_console".to_string(),
        question: "What was your first game console?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_website".to_string(),
        question: "What was the first website you visited?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_program".to_string(),
        question: "What was the first program you learned to code?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_app".to_string(),
        question: "What was the first app you downloaded?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_streaming".to_string(),
        question: "What was your first streaming service?".to_string(),
        category: "Technology".to_string(),
    },
    SecurityQuestion {
        id: "tech_first_smartphone".to_string(),
        question: "What year did you get your first smartphone?".to_string(),
        category: "Technology".to_string(),
    },

    // Hobbies & Interests
    SecurityQuestion {
        id: "hobby_first_instrument".to_string(),
        question: "What was the first musical instrument you learned?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_art".to_string(),
        question: "What was your first art project?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_craft".to_string(),
        question: "What was your first craft project?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_collection".to_string(),
        question: "What was the first thing you collected?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_garden".to_string(),
        question: "What was the first plant you grew?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_recipe".to_string(),
        question: "What was the first recipe you learned to cook?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_knit".to_string(),
        question: "What was the first thing you knitted or crocheted?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_photo".to_string(),
        question: "What was the subject of your first photograph?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_dance".to_string(),
        question: "What was the first dance you learned?".to_string(),
        category: "Hobbies".to_string(),
    },
    SecurityQuestion {
        id: "hobby_first_woodwork".to_string(),
        question: "What was the first woodworking project you made?".to_string(),
        category: "Hobbies".to_string(),
    },

    // Memorable Events
    SecurityQuestion {
        id: "event_first_concert".to_string(),
        question: "What was your first concert?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_sport_event".to_string(),
        question: "What was your first live sporting event?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_theater".to_string(),
        question: "What was your first theater show?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_museum".to_string(),
        question: "What was the first museum you visited?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_festival".to_string(),
        question: "What was your first festival?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_parade".to_string(),
        question: "What was the first parade you attended?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_zoo".to_string(),
        question: "What was the first zoo you visited?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_aquarium".to_string(),
        question: "What was the first aquarium you visited?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_circus".to_string(),
        question: "What was the first circus you attended?".to_string(),
        category: "Events".to_string(),
    },
    SecurityQuestion {
        id: "event_first_amusement".to_string(),
        question: "What was the first amusement park you visited?".to_string(),
        category: "Events".to_string(),
    },
    ]
}

/// Get all security questions
pub fn get_all_questions() -> Vec<SecurityQuestion> {
    get_security_questions_library()
}

/// Get questions by category
pub fn get_questions_by_category(category: &str) -> Vec<SecurityQuestion> {
    get_security_questions_library()
        .iter()
        .filter(|q| q.category == category)
        .cloned()
        .collect()
}

/// Get random questions (for selection during enrollment)
pub fn get_random_questions(count: usize) -> Vec<SecurityQuestion> {
    use rand::seq::SliceRandom;
    let mut rng = rand::thread_rng();
    let mut questions = get_security_questions_library();
    questions.shuffle(&mut rng);
    questions.truncate(count);
    questions
}

/// Get questions by IDs
pub fn get_questions_by_ids(ids: &[String]) -> Vec<SecurityQuestion> {
    get_security_questions_library()
        .iter()
        .filter(|q| ids.contains(&q.id))
        .cloned()
        .collect()
}
