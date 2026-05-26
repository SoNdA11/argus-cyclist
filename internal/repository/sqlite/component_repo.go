package sqlite

import (
	"argus-cyclist/internal/domain"
	"fmt"
)

type ComponentRepo struct {
	state *DBState
}

func NewComponentRepository(state *DBState) domain.ComponentRepository {
	return &ComponentRepo{state: state}
}

func (r *ComponentRepo) GetComponents() ([]domain.BikeComponent, error) {
	var components []domain.BikeComponent
	if r.state.UserDB == nil {
		return components, nil
	}
	err := r.state.UserDB.Order("created_at desc").Find(&components).Error
	return components, err
}

func (r *ComponentRepo) GetComponentByID(id uint) (domain.BikeComponent, error) {
	var c domain.BikeComponent
	if r.state.UserDB == nil {
		return c, fmt.Errorf("no db")
	}
	err := r.state.UserDB.First(&c, id).Error
	return c, err
}

func (r *ComponentRepo) SaveComponent(c domain.BikeComponent) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no user loaded")
	}
	return r.state.UserDB.Create(&c).Error
}

func (r *ComponentRepo) UpdateComponent(c domain.BikeComponent) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no user loaded")
	}
	return r.state.UserDB.Save(&c).Error
}

func (r *ComponentRepo) DeleteComponent(id uint) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no db")
	}
	r.state.UserDB.Where("component_id = ?", id).Delete(&domain.ComponentReplacement{})
	return r.state.UserDB.Delete(&domain.BikeComponent{}, id).Error
}

func (r *ComponentRepo) GetComponentReplacements(componentID uint) ([]domain.ComponentReplacement, error) {
	var replacements []domain.ComponentReplacement
	if r.state.UserDB == nil {
		return replacements, nil
	}
	err := r.state.UserDB.Where("component_id = ?", componentID).Order("replaced_at desc").Find(&replacements).Error
	return replacements, err
}

func (r *ComponentRepo) SaveReplacement(rep domain.ComponentReplacement) error {
	if r.state.UserDB == nil {
		return fmt.Errorf("no user loaded")
	}
	return r.state.UserDB.Create(&rep).Error
}
