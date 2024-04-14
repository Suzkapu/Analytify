import {Component, OnInit} from '@angular/core';
import {BackendService} from "../../services/backend/backend.service";
import {Router} from "@angular/router";
import {TagComponent} from "../tag/tag.component";

@Component({
  selector: 'app-tag-manager',
  templateUrl: './tag-manager.component.html',
  styleUrls: ['./tag-manager.component.scss']
})
export class TagManagerComponent implements OnInit{
  allTags: any;

  value: string = "";

  constructor(private backendService: BackendService, private router: Router) {
  }

  ngOnInit(): void {
    this.getTags();
  }

  getTags() {
    this.backendService.getAllTags().subscribe((data) => {
      this.allTags = data;
    });
  }

  addNewTag() {
    this.backendService.createNewTag(this.value).subscribe((data) => {
      this.getTags();
    });
    this.allTags.push({name: this.value});
  }

  deleteTag(id: any) {
    this.backendService.deleteTag(id).subscribe((data) => {
      this.getTags();
    });
  }

  back(){
    this.router.navigate(['/tag']);
  }
}
